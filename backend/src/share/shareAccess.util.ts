import moment from "moment";

export function isShareExpired(share?: { expiration: Date } | null) {
  if (!share) {
    return false;
  }

  return (
    moment().isAfter(share.expiration) && !moment(share.expiration).isSame(0)
  );
}

export function isShareWithinExpiredEditablePeriod(
  share: { expiration: Date },
  expiredEditablePeriod: moment.DurationInputArg1,
  unit: moment.unitOfTime.DurationConstructor,
) {
  if (!isShareExpired(share)) {
    return true;
  }

  return moment().isSameOrBefore(
    moment(share.expiration).add(expiredEditablePeriod, unit),
  );
}

export function isShareRemoved(
  share?: { removedReason?: string | null } | null,
) {
  return !!share?.removedReason;
}
