const DEFAULT_ADMIN_ORIGIN = "http://localhost:3001";

export function jsonWithAdminCors(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  const response = Response.json(body, { status });
  applyAdminCors(req, response);
  return response;
}

export function emptyAdminCors(req: Request): Response {
  const response = new Response(null, { status: 204 });
  applyAdminCors(req, response);
  return response;
}

function applyAdminCors(req: Request, response: Response): void {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (process.env.ADMIN_ORIGIN ?? DEFAULT_ADMIN_ORIGIN)
    .split(",")
    .map((value) => value.trim());

  if (origin && allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
