import {IRPCLogger} from './types';

export default class RPCConsoleLogger implements IRPCLogger {
    private context: string;

    constructor(context?: string) {
        if (context) {
            this.context = context;
        }
    }

    public log(...args: any) {
        return console.log.bind(console, this.getPrefix())(args);
    }

    public info(...args: any) {
        return console.info.bind(console, this.getPrefix())(args);
    }

    public warn(...args: any) {
        return console.warn.bind(console, this.getPrefix())(args);
    }

    public debug(...args: any) {
        return console.debug.bind(console, this.getPrefix())(args);
    }

    public error(...args: any) {
        return console.error.bind(console, this.getPrefix())(args);
    }

    private getPrefix(): string {
        var prefix = [];
        prefix.push(new Date().toString());
        prefix.push(`- ${this.context} -`);

        return prefix.join(' ');
    }
}