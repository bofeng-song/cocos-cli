export interface CompilationStatus {
    state: 'idle' | 'compiling' | 'ready' | 'failed';
    revision: number;
    error?: { message: string; stack?: string; file?: string };
}

/** Serializes iterations and retains failures until a later iteration succeeds. */
export class CompilationState {
    private queue: Promise<unknown> = Promise.resolve();
    private pending = 0;
    private revision = 0;
    private error?: CompilationStatus['error'];

    constructor(private readonly changed: (status: CompilationStatus) => void = () => {}) {}

    getStatus(): CompilationStatus {
        return {
            state: this.pending ? 'compiling' : this.error ? 'failed' : this.revision ? 'ready' : 'idle',
            revision: this.revision,
            ...(this.error ? { error: { ...this.error } } : {}),
        };
    }

    run<T>(build: () => Promise<T>): Promise<T> {
        ++this.pending;
        this.changed(this.getStatus());
        const task = this.queue.then(async () => {
            try {
                const result = await build();
                ++this.revision;
                this.error = undefined;
                return result;
            } catch (error) {
                const failure = error as any;
                this.error = {
                    message: failure?.message || String(error),
                    ...(typeof failure?.stack === 'string' ? { stack: failure.stack } : {}),
                    ...(typeof failure?.file === 'string' ? { file: failure.file } : {}),
                };
                throw error;
            } finally {
                --this.pending;
                this.changed(this.getStatus());
            }
        });
        this.queue = task.catch(() => undefined);
        return task;
    }
}
