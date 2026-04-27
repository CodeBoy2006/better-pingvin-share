import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Config } from "@prisma/client";
import * as argon from "argon2";
import { EventEmitter } from "events";
import * as fs from "fs";
import { PrismaService } from "src/prisma/prisma.service";
import { stringToTimespan } from "src/utils/date.util";
import { parse as yamlParse } from "yaml";
import { CONFIG_FILE } from "src/constants";
import {
  getDefinedConfigVariable,
  YamlConfig,
} from "./configDefinitions";

const TIMESPAN_UNITS = [
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "years",
] as const;

type TimespanUnit = (typeof TIMESPAN_UNITS)[number];

const TIMESPAN_IN_MINUTES: Record<TimespanUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
  weeks: 60 * 24 * 7,
  months: 60 * 24 * 30,
  years: 60 * 24 * 365,
};

/**
 * ConfigService extends EventEmitter to allow listening for config updates,
 * now only `update` event will be emitted.
 */
@Injectable()
export class ConfigService extends EventEmitter {
  yamlConfig?: YamlConfig;
  logger = new Logger(ConfigService.name);

  constructor(
    @Inject("CONFIG_VARIABLES") private configVariables: Config[],
    private prisma: PrismaService,
  ) {
    super();
  }

  // Initialize gets called by the ConfigModule
  async initialize() {
    await this.loadYamlConfig();

    if (this.yamlConfig) {
      await this.migrateInitUser();
    }
  }

  private async loadYamlConfig() {
    let configFile: string = "";
    try {
      configFile = fs.readFileSync(CONFIG_FILE, "utf8");
    } catch (_error) {
      this.logger.log(
        "Config.yaml is not set. Falling back to UI configuration.",
      );
    }
    this.yamlConfig = yamlParse(configFile);

    if (this.yamlConfig) {
      for (const configVariable of this.configVariables) {
        const category = this.yamlConfig[configVariable.category];
        if (!category) continue;
        if (category[configVariable.name] !== undefined) {
          configVariable.value = category[configVariable.name]?.toString();
          this.emit("update", configVariable.name, configVariable.value);
        }
      }
    }

    this.validateConfigConsistency();
  }

  private async migrateInitUser(): Promise<void> {
    if (!this.yamlConfig.initUser.enabled) return;

    const userCount = await this.prisma.user.count({
      where: { isAdmin: true },
    });
    if (userCount === 1) {
      this.logger.log(
        "Skip initial user creation. Admin user is already existent.",
      );
      return;
    }
    await this.prisma.user.create({
      data: {
        email: this.yamlConfig.initUser.email,
        username: this.yamlConfig.initUser.username,
        password: this.yamlConfig.initUser.password
          ? await argon.hash(this.yamlConfig.initUser.password)
          : null,
        isAdmin: this.yamlConfig.initUser.isAdmin,
      },
    });
  }

  get(key: `${string}.${string}`): any {
    const configVariable =
      this.configVariables.find(
        (variable) => `${variable.category}.${variable.name}` == key,
      ) ?? getDefinedConfigVariable(key);

    if (!configVariable) throw new Error(`Config variable ${key} not found`);

    const value = configVariable.value ?? configVariable.defaultValue;

    if (configVariable.type == "number" || configVariable.type == "filesize")
      return parseInt(value);
    if (configVariable.type == "boolean") return value == "true";
    if (configVariable.type == "string" || configVariable.type == "text")
      return value;
    if (configVariable.type == "timespan") return stringToTimespan(value);
  }

  async getByCategory(category: string) {
    const configVariables = this.configVariables
      .filter((c) => !c.locked && category == c.category)
      .sort((c) => c.order);

    return configVariables.map((variable) => {
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        value: variable.value ?? variable.defaultValue,
        allowEdit: this.isEditAllowed(),
      };
    });
  }

  async list() {
    const configVariables = this.configVariables.filter((c) => !c.secret);

    return configVariables.map((variable) => {
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        value: variable.value ?? variable.defaultValue,
      };
    });
  }

  async updateMany(data: { key: string; value: string | number | boolean }[]) {
    if (!this.isEditAllowed())
      throw new BadRequestException(
        "You are only allowed to update config variables via the config.yaml file",
      );

    const nextValues = this.createConfigValueMap();
    for (const variable of data) {
      nextValues[variable.key] = this.normalizeConfigValue(variable.value);
    }
    this.validateConfigConsistency(nextValues);

    const response: Config[] = [];

    for (const variable of data) {
      response.push(
        await this.update(variable.key, variable.value, {
          skipConsistencyValidation: true,
        }),
      );
    }

    return response;
  }

  async update(
    key: string,
    value: string | number | boolean,
    options?: { skipConsistencyValidation?: boolean },
  ) {
    if (!this.isEditAllowed())
      throw new BadRequestException(
        "You are only allowed to update config variables via the config.yaml file",
      );

    const configVariable = await this.prisma.config.findUnique({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
    });

    if (!configVariable || configVariable.locked)
      throw new NotFoundException("Config variable not found");

    if (value === "") {
      value = null;
    } else if (
      typeof value != configVariable.type &&
      typeof value == "string" &&
      configVariable.type != "text" &&
      configVariable.type != "timespan"
    ) {
      throw new BadRequestException(
        `Config variable must be of type ${configVariable.type}`,
      );
    }

    const normalizedValue = this.normalizeConfigValue(value);
    const nextValues = this.createConfigValueMap();
    nextValues[key] = normalizedValue;

    this.validateConfigVariable(key, normalizedValue);
    if (!options?.skipConsistencyValidation) {
      this.validateConfigConsistency(nextValues);
    }

    const updatedVariable = await this.prisma.config.update({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
      data: { value: value === null ? null : value.toString() },
    });

    this.configVariables = await this.prisma.config.findMany();

    this.emit("update", key, value);

    return updatedVariable;
  }

  validateConfigVariable(
    key: string,
    value: string | number | boolean | null,
  ) {
    const validations = [
      {
        key: "share.shareIdLength",
        condition: (value: number) => value >= 2 && value <= 50,
        message: "Share ID length must be between 2 and 50",
      },
      {
        key: "share.zipCompressionLevel",
        condition: (value: number) => value >= 0 && value <= 9,
        message: "Zip compression level must be between 0 and 9",
      },
    ];

    const validation = validations.find((validation) => validation.key == key);
    if (validation && !validation.condition(value as any)) {
      throw new BadRequestException(validation.message);
    }

    const definition = getDefinedConfigVariable(key as `${string}.${string}`);
    if (definition?.type === "timespan") {
      this.assertValidTimespan(value);
    }
  }

  isEditAllowed(): boolean {
    return this.yamlConfig === undefined || this.yamlConfig === null;
  }

  private normalizeConfigValue(value: string | number | boolean) {
    return value === "" ? null : value;
  }

  private createConfigValueMap(): Record<
    string,
    string | number | boolean | null
  > {
    return Object.fromEntries(
      this.configVariables.map((variable) => [
        `${variable.category}.${variable.name}`,
        variable.value ?? variable.defaultValue,
      ]),
    );
  }

  private validateConfigConsistency(
    values: Record<string, string | number | boolean | null> =
      this.createConfigValueMap(),
  ) {
    for (const [key, value] of Object.entries(values)) {
      this.validateConfigVariable(key, value);
    }

    const expiredEditablePeriod = this.parseTimespanValue(
      values["share.expiredEditablePeriod"],
    );
    const fileRetentionPeriod = this.parseTimespanValue(
      values["share.fileRetentionPeriod"],
    );

    if (
      this.timespanToMinutes(expiredEditablePeriod) >
      this.timespanToMinutes(fileRetentionPeriod)
    ) {
      throw new BadRequestException(
        "Expired editable period must not exceed file retention period",
      );
    }
  }

  private assertValidTimespan(value: string | number | boolean | null) {
    this.parseTimespanValue(value);
  }

  private parseTimespanValue(value: string | number | boolean | null) {
    if (typeof value !== "string") {
      throw new BadRequestException("Timespan config variables must be strings");
    }

    const match = value.trim().match(/^(\d+)\s+([a-z]+)$/);
    if (!match) {
      throw new BadRequestException(
        "Timespan config variables must use the format '<number> <unit>'",
      );
    }

    const unit = match[2] as TimespanUnit;
    if (!TIMESPAN_UNITS.includes(unit)) {
      throw new BadRequestException(`Unsupported timespan unit: ${match[2]}`);
    }

    return {
      value: parseInt(match[1]),
      unit,
    };
  }

  private timespanToMinutes(timespan: { value: number; unit: TimespanUnit }) {
    return timespan.value * TIMESPAN_IN_MINUTES[timespan.unit];
  }
}
