"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoteStatusType = exports.HeartbeatStatusType = exports.StatusType = void 0;
exports.useMetrics = useMetrics;
const react_1 = require("react");
const socket_io_client_1 = require("socket.io-client");
// Block status
var StatusType;
(function (StatusType) {
    StatusType[StatusType["Missed"] = 0] = "Missed";
    StatusType[StatusType["Prevote"] = 1] = "Prevote";
    StatusType[StatusType["Precommit"] = 2] = "Precommit";
    StatusType[StatusType["Signed"] = 3] = "Signed";
    StatusType[StatusType["Proposed"] = 4] = "Proposed"; // Block proposed
})(StatusType || (exports.StatusType = StatusType = {}));
// Heartbeat status
var HeartbeatStatusType;
(function (HeartbeatStatusType) {
    HeartbeatStatusType[HeartbeatStatusType["Unknown"] = -1] = "Unknown";
    HeartbeatStatusType[HeartbeatStatusType["Missed"] = 0] = "Missed";
    HeartbeatStatusType[HeartbeatStatusType["Signed"] = 1] = "Signed"; // Successfully signed heartbeat
})(HeartbeatStatusType || (exports.HeartbeatStatusType = HeartbeatStatusType = {}));
// EVM vote status
var VoteStatusType;
(function (VoteStatusType) {
    VoteStatusType["Unknown"] = "unknown";
    VoteStatusType["Unsubmitted"] = "unsubmitted";
    VoteStatusType["Validated"] = "validated";
    VoteStatusType["Invalid"] = "invalid";
})(VoteStatusType || (exports.VoteStatusType = VoteStatusType = {}));
function useMetrics() {
    const [socket, setSocket] = (0, react_1.useState)(null);
    const [metrics, setMetrics] = (0, react_1.useState)({
        chainId: '',
        moniker: '',
        lastBlock: 0,
        lastBlockTime: new Date(),
        signStatus: [],
        totalMissed: 0,
        totalSigned: 0,
        totalProposed: 0,
        consecutiveMissed: 0,
        prevoteMissed: 0,
        precommitMissed: 0,
        connected: false,
        lastError: '',
        // Initialize heartbeat metrics
        heartbeatStatus: [],
        heartbeatBlocks: [],
        heartbeatsMissed: 0,
        heartbeatsSigned: 0,
        heartbeatsConsecutiveMissed: 0,
        lastHeartbeatPeriod: 0,
        lastHeartbeatTime: null,
        heartbeatConnected: false,
        heartbeatLastError: '',
        // Initialize EVM votes metrics
        evmVotesEnabled: false,
        evmVotes: {},
        evmLastGlobalPollId: 0,
        // Initialize AMPD metrics
        ampdEnabled: false,
        ampdVotes: {},
        ampdSignings: {},
        ampdSupportedChains: []
    });
    const [connectionInfo, setConnectionInfo] = (0, react_1.useState)({
        connected: false,
        heartbeatConnected: false,
        endpoint: '',
        wsEndpoint: '',
        validatorAddress: '',
        broadcasterAddress: '',
        evmVotesEnabled: false,
        ampdEnabled: false,
        ampdAddress: ''
    });
    const [isConnected, setIsConnected] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        // Create socket connection
        const socketInstance = (0, socket_io_client_1.io)(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001');
        // Handle connection events
        socketInstance.on('connect', () => {
            setIsConnected(true);
            console.log('Connected to WebSocket server');
        });
        socketInstance.on('disconnect', () => {
            setIsConnected(false);
            console.log('Disconnected from WebSocket server');
        });
        // Listen for metrics updates
        socketInstance.on('metrics-update', (data) => {
            // Convert lastBlockTime from string to Date if needed
            if (typeof data.lastBlockTime === 'string') {
                data.lastBlockTime = new Date(data.lastBlockTime);
            }
            // Convert lastHeartbeatTime from string to Date if needed
            if (data.lastHeartbeatTime && typeof data.lastHeartbeatTime === 'string') {
                data.lastHeartbeatTime = new Date(data.lastHeartbeatTime);
            }
            setMetrics(data);
        });
        // Listen for EVM votes updates
        socketInstance.on('evm-votes-update', (data) => {
            setMetrics(prevMetrics => (Object.assign(Object.assign({}, prevMetrics), { evmVotes: data })));
        });
        // Listen for connection information
        socketInstance.on('connection-status', (data) => {
            setConnectionInfo(data);
        });
        setSocket(socketInstance);
        // Cleanup on disconnect
        return () => {
            socketInstance.disconnect();
        };
    }, []);
    return { metrics, connectionInfo, isConnected, socket };
}
