import { isIP } from "node:net";
import { Request } from "express";

function normalizeIpv4(value: string) {
  const octets = value.split(".");

  if (octets.length !== 4) {
    return undefined;
  }

  const normalizedOctets = octets.map((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return undefined;
    }

    const parsed = Number.parseInt(octet, 10);
    if (parsed < 0 || parsed > 255) {
      return undefined;
    }

    return parsed.toString(10);
  });

  if (normalizedOctets.some((octet) => octet === undefined)) {
    return undefined;
  }

  return normalizedOctets.join(".");
}

function parseIpv6Part(part: string) {
  if (!part) {
    return [];
  }

  const segments = part.split(":");
  const groups: number[] = [];

  for (const segment of segments) {
    if (!segment) {
      return undefined;
    }

    if (segment.includes(".")) {
      const normalizedIpv4 = normalizeIpv4(segment);
      if (!normalizedIpv4) {
        return undefined;
      }

      const octets = normalizedIpv4.split(".").map((octet) => parseInt(octet));
      groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(segment)) {
      return undefined;
    }

    groups.push(Number.parseInt(segment, 16));
  }

  return groups;
}

function serializeIpv6(groups: number[]) {
  const normalizedGroups = groups.map((group) => group.toString(16));

  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;

  for (let index = 0; index <= groups.length; index += 1) {
    if (index < groups.length && groups[index] === 0) {
      if (currentStart === -1) {
        currentStart = index;
      }

      currentLength += 1;
      continue;
    }

    if (currentLength > bestLength) {
      bestStart = currentStart;
      bestLength = currentLength;
    }

    currentStart = -1;
    currentLength = 0;
  }

  if (bestLength < 2) {
    bestStart = -1;
  }

  const parts: string[] = [];

  for (let index = 0; index < normalizedGroups.length; index += 1) {
    if (index === bestStart) {
      if (index === 0) {
        parts.push("");
      }

      parts.push("");
      index += bestLength - 1;

      if (index === normalizedGroups.length - 1) {
        parts.push("");
      }

      continue;
    }

    parts.push(normalizedGroups[index]);
  }

  return parts.join(":").replace(/:{3,}/g, "::");
}

function normalizeIpv6(value: string) {
  const parts = value.toLowerCase().split("::");

  if (parts.length > 2) {
    return undefined;
  }

  const leftGroups = parseIpv6Part(parts[0] ?? "");
  const rightGroups = parseIpv6Part(parts[1] ?? "");

  if (!leftGroups || !rightGroups) {
    return undefined;
  }

  let groups = [...leftGroups, ...rightGroups];

  if (parts.length === 1) {
    if (groups.length !== 8) {
      return undefined;
    }
  } else {
    if (groups.length >= 8) {
      return undefined;
    }

    const missingGroups = 8 - groups.length;
    groups = [
      ...leftGroups,
      ...new Array(missingGroups).fill(0),
      ...rightGroups,
    ];
  }

  if (
    groups.length !== 8 ||
    groups.some((group) => group < 0 || group > 0xffff)
  ) {
    return undefined;
  }

  return serializeIpv6(groups);
}

export function normalizeIpAddress(value?: string | null) {
  if (!value) {
    return undefined;
  }

  let normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes(",")) {
    normalized = normalized.split(",")[0].trim();
  }

  const bracketedIpv6Match = normalized.match(/^\[([^[\]]+)\](?::\d+)?$/);
  if (bracketedIpv6Match) {
    normalized = bracketedIpv6Match[1];
  }

  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex >= 0) {
    normalized = normalized.slice(0, zoneIndex);
  }

  const ipv4WithPortMatch = normalized.match(
    /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/,
  );
  if (ipv4WithPortMatch) {
    normalized = ipv4WithPortMatch[1];
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalizeIpv4(normalized.slice("::ffff:".length));
    if (mappedIpv4) {
      return mappedIpv4;
    }
  }

  const family = isIP(normalized);
  if (family === 4) {
    return normalizeIpv4(normalized);
  }

  if (family === 6) {
    return normalizeIpv6(normalized);
  }

  return undefined;
}

export function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    return normalizeIpAddress(forwardedFor);
  }

  return normalizeIpAddress(request.ip);
}
