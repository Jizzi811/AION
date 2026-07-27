export async function GET() {
  return Response.json(
    { publicKey: "a4ee004f-1a2c-49cf-ad68-854c6e4f3265" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
