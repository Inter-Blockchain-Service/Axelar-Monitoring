"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidatorSignatureManager = void 0;
const events_1 = require("events");
const tendermint_1 = require("./tendermint");
class ValidatorSignatureManager extends events_1.EventEmitter {
    constructor(validatorAddress) {
        super();
        this.currentBlockHeight = 0;
        this.currentBlockProposer = '';
        this.currentBlockSignatures = [];
        this.currentVotes = new Map();
        this.validatorAddress = validatorAddress.toUpperCase();
    }
    handleNewBlock(blockData) {
        try {
            const height = parseInt(blockData.block.header.height);
            const proposerAddress = blockData.block.header.proposer_address;
            const signatures = this.extractSignatures(blockData);
            this.currentBlockHeight = height;
            this.currentBlockProposer = proposerAddress;
            this.currentBlockSignatures = signatures;
            let status = tendermint_1.StatusType.Missed;
            // Check if this validator is the proposer
            if (proposerAddress === this.validatorAddress) {
                status = tendermint_1.StatusType.Proposed;
            }
            // Check if the validator signed this block
            else if (this.currentBlockSignatures.includes(this.validatorAddress)) {
                status = tendermint_1.StatusType.Signed;
            }
            const update = {
                height,
                status,
                final: true
            };
            this.emit('status-update', update);
        }
        catch (error) {
            console.error('Block processing error:', error);
        }
    }
    handleVote(voteData) {
        try {
            if (voteData.Vote.validator_address !== this.validatorAddress) {
                return; // This is not a vote from our validator
            }
            const height = parseInt(voteData.Vote.height);
            let status;
            switch (voteData.Vote.type) {
                case 1: // SIGNED_MSG_TYPE_PREVOTE
                    status = tendermint_1.StatusType.Prevote;
                    break;
                case 2: // SIGNED_MSG_TYPE_PRECOMMIT
                    status = tendermint_1.StatusType.Precommit;
                    break;
                default:
                    return; // Unknown vote type
            }
            const update = {
                height,
                status,
                final: false
            };
            this.emit('status-update', update);
        }
        catch (error) {
            console.error('Vote processing error:', error);
        }
    }
    extractSignatures(blockData) {
        const signatures = [];
        if (blockData.block.last_commit && blockData.block.last_commit.signatures) {
            blockData.block.last_commit.signatures.forEach((sig) => {
                if (sig.validator_address) {
                    signatures.push(sig.validator_address);
                }
            });
        }
        return signatures;
    }
}
exports.ValidatorSignatureManager = ValidatorSignatureManager;
