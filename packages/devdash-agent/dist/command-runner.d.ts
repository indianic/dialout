export interface RunCommandArgs {
    command: string;
    cwd?: string;
    background?: boolean;
    logName?: string;
}
export interface RunCommandResult {
    ok: boolean;
    pid?: number;
    exitCode?: number;
    output?: string;
    error?: string;
}
export declare function runCommand(args: RunCommandArgs): Promise<RunCommandResult>;
//# sourceMappingURL=command-runner.d.ts.map