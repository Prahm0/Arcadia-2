// The Worker runs with nodejs_compat, which provides node:buffer, but this
// project doesn't pull in @types/node. This is the one piece it uses.
declare module "node:buffer" {
  export const Buffer: {
    from(data: ArrayBuffer): { toString(encoding: "base64"): string };
  };
}
