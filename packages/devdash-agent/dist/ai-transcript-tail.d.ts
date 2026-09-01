export declare function splitRecords(buffer: string): {
    records: unknown[];
    rest: string;
};
export declare class TranscriptTail {
    private readonly path;
    private readonly onRecords;
    private position;
    private partial;
    private timer;
    lastGrowthMs: number;
    constructor(path: string, onRecords: (records: unknown[]) => void);
    start(): void;
    stop(): void;
    pump(): void;
}
//# sourceMappingURL=ai-transcript-tail.d.ts.map