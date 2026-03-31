const ts = () => new Date().toISOString();

export const log = (tag: string, msg: string) => console.log(`${ts()} [${tag}] ${msg}`);
export const warn = (tag: string, msg: string) => console.warn(`${ts()} [${tag}] ${msg}`);
export const error = (tag: string, msg: string) => console.error(`${ts()} [${tag}] ${msg}`);
