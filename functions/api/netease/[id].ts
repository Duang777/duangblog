import { handleNeteaseRequest } from "../../../src/lib/netease-resolve";

type Context = { params: { id?: string | string[] } };

export function onRequestGet({ params }: Context): Promise<Response> {
  return handleNeteaseRequest(typeof params.id === "string" ? params.id : "");
}
