import { EventEmitter } from 'events';
import { StatusType, StatusUpdate } from './tendermint';

export class ValidatorSignatureManager extends EventEmitter {
  private validatorAddress: string;
  private currentBlockHeight: number = 0;
  private currentBlockProposer: string = '';
  private currentBlockSignatures: string[] = [];
  private currentVotes: Map<number, Set<string>> = new Map();

  constructor(validatorAddress: string) {
    super();
    this.validatorAddress = validatorAddress.toUpperCase();
  }

  public handleNewBlock(blockData: any): void {
    try {
      const height = parseInt(blockData.block.header.height);
      const proposerAddress = blockData.block.header.proposer_address;
      const signatures = this.extractSignatures(blockData);

      this.currentBlockHeight = height;
      this.currentBlockProposer = proposerAddress;
      this.currentBlockSignatures = signatures;

      let status = StatusType.Missed;

      // Check if this validator is the proposer
      if (proposerAddress === this.validatorAddress) {
        status = StatusType.Proposed;
      }
      // Check if the validator signed this block
      else if (this.currentBlockSignatures.includes(this.validatorAddress)) {
        status = StatusType.Signed;
      }

      const update: StatusUpdate = {
        height,
        status,
        final: true
      };

      this.emit('status-update', update);
    } catch (error) {
      console.error('Block processing error:', error);
    }
  }

  public handleVote(voteData: any): void {
    try {
      if (voteData.Vote.validator_address !== this.validatorAddress) {
        return; // This is not a vote from our validator
      }

      const height = parseInt(voteData.Vote.height);
      let status: StatusType;

      switch (voteData.Vote.type) {
        case 1: // SIGNED_MSG_TYPE_PREVOTE
          status = StatusType.Prevote;
          break;
        case 2: // SIGNED_MSG_TYPE_PRECOMMIT
          status = StatusType.Precommit;
          break;
        default:
          return; // Unknown vote type
      }

      const update: StatusUpdate = {
        height,
        status,
        final: false
      };

      this.emit('status-update', update);
    } catch (error) {
      console.error('Vote processing error:', error);
    }
  }

  private extractSignatures(blockData: any): string[] {
    const signatures: string[] = [];
    if (blockData.block.last_commit && blockData.block.last_commit.signatures) {
      blockData.block.last_commit.signatures.forEach((sig: any) => {
        if (sig.validator_address) {
          signatures.push(sig.validator_address);
        }
      });
    }
    return signatures;
  }
} 