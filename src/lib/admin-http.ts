const DEFAULT_ADMIN_ORIGIN = "http://localhost:3001";

export function adminOriginAllowed(
  origin: string,
  adminOriginEnv = process.env.ADMIN_ORIGIN,
): boolean {
  const trimmed = origin.trim();
  if (!trimmed) {
    return false;
  }
  const allowed = (adminOriginEnv ?? DEFAULT_ADMIN_ORIGIN)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(trimmed);
}

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

export function fileWithAdminCors(
  req: Request,
  body: string,
  filename: string,
): Response {
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
  applyAdminCors(req, response);
  return response;
}

function applyAdminCors(req: Request, response: Response): void {
  const origin = req.headers.get("origin") ?? "";
  if (origin && adminOriginAllowed(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
