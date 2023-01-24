export type RPCServiceProviderFunction<D, V> = (data: D) => Promise<V>;

export interface IRPCServer {
    setDebug(debug: boolean): void;
    setChannelPrefetchCount(channelPrefetchCount: number): void;
    setConnectionRecoveryMaxTryCount(connectionRecoveryMaxTryCount: number): void;
    setConnectionReconnectTime(connectionReconnectTimeInSeconds: number): void;
    start(): Promise<void>;
    stop(): Promise<void>;
    provide<D, V>(
        serviceName: string,
        fn: RPCServiceProviderFunction<D, V>
    ): void;
}

export interface IRPCClient {
    setConnectionRecoveryMaxTryCount(connectionRecoveryMaxTryCount: number): void;
    setConnectionReconnectTime(connectionReconnectTimeInSeconds: number): void;
    setDebug(debug: boolean): void;
    start(): Promise<void>;
    stop(): Promise<void>;
    call<T>(
        serviceName: string,
        data: any,
    ): Promise<T>;
}

export interface IRPCLogger {
    log(...args: any): void;
    info(...args: any): void;
    warn(...args: any): void;
    debug(...args: any): void;
    error(...args: any): void;
}
