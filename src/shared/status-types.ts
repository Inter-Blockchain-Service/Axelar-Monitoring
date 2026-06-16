/** Shared vote/signing status constants (server + client). */

export enum EvmVoteStatus {
  Unknown = 'unknown',
  Unsubmitted = 'unsubmitted',
  Validated = 'validated',
  Invalid = 'invalid',
}

export enum AmpdVoteStatus {
  Unknown = 'unknown',
  Unsubmit = 'unsubmit',
  SucceededOnChain = 'succeeded_on_chain',
  NotFound = 'not_found',
}

export enum AmpdSigningStatus {
  Unknown = 'unknown',
  Unsubmit = 'unsubmit',
  Signed = 'signed',
}

/** Map raw WASM vote value from MsgExecuteContract to canonical AMPD status. */
export function mapAmpdVoteResult(rawVote: string | undefined | null): AmpdVoteStatus {
  if (!rawVote) {
    return AmpdVoteStatus.Unsubmit;
  }

  const normalized = rawVote.trim().toLowerCase();

  if (normalized === AmpdVoteStatus.SucceededOnChain || normalized.includes('succeeded')) {
    return AmpdVoteStatus.SucceededOnChain;
  }
  if (normalized === AmpdVoteStatus.NotFound || normalized.includes('failed') || normalized.includes('not_found')) {
    return AmpdVoteStatus.NotFound;
  }
  if (normalized === AmpdVoteStatus.Unsubmit) {
    return AmpdVoteStatus.Unsubmit;
  }
  if (normalized === AmpdVoteStatus.Unknown) {
    return AmpdVoteStatus.Unknown;
  }

  console.warn(`Unknown AMPD vote result "${rawVote}", treating as not_found`);
  return AmpdVoteStatus.NotFound;
}

export function isAmpdVoteSuccess(status: string): boolean {
  return status === AmpdVoteStatus.SucceededOnChain;
}

export function isAmpdVoteFailure(status: string): boolean {
  return status === AmpdVoteStatus.NotFound;
}

export function isAmpdVotePending(status: string): boolean {
  return status === AmpdVoteStatus.Unsubmit;
}
