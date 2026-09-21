declare module "node-webpmux" {
  class Image {
    exif: Buffer | undefined;
    load(source: Buffer | string): Promise<void>;
    save(path?: string | null): Promise<Buffer>;
  }

  const webpmux: { Image: typeof Image };
  export default webpmux;
}
