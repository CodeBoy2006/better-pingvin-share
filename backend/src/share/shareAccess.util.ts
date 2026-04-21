import moment from "moment";

export function isShareExpired(share?: { expiration: Date } | null) {
  if (!share) {
    return false;
  }

  return (
    moment().isAfter(share.expiration) && !moment(share.expiration).isSame(0)
  );
}

export function isShareRemoved(
  share?: { removedReason?: string | null } | null,
) {
  return !!share?.removedReason;
}
