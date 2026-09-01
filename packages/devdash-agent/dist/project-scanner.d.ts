export interface DetectedProject {
    name: string;
    path: string;
    stack: string;
    framework: string;
    language: string;
    packageManager: string | null;
    port: number | null;
    portSource: 'script' | 'env' | 'config' | 'default' | 'none';
    url: string | null;
    startCommand: string | null;
    running: boolean;
}
export declare function scanProjects(rootPath: string, maxDepth?: number): Promise<DetectedProject[]>;
//# sourceMappingURL=project-scanner.d.ts.map