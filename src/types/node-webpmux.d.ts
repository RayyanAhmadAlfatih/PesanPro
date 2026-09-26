declare module "node-webpmux" {
  interface Image {
    exif: Buffer | undefined;
    load(source: Buffer | string): Promise<void>;
    save(path?: string | null): Promise<Buffer>;
  }

  const webpmux: { Image: new () => Image };
  export default webpmux;
}
