import { isRouteErrorResponse, useRouteError } from "react-router-dom";

function getErrorSummary(error) {
  if (isRouteErrorResponse(error)) {
    return {
      title: `Error ${error.status}`,
      message: String(error.statusText || "Route failed to load."),
      detail: typeof error.data === "string" ? error.data : "",
    };
  }

  const message = String(error?.message || "An unexpected error occurred.");
  const dynamicImportFailure =
    message.toLowerCase().includes("failed to fetch dynamically imported module") ||
    message.toLowerCase().includes("importing a module script failed");

  if (dynamicImportFailure) {
    const isLocalDevFetch =
      import.meta.env.DEV &&
      /localhost:\d+|127\.0\.0\.1:\d+/i.test(message);

    if (isLocalDevFetch) {
      return {
        title: "Dev module failed to load",
        message:
          "Vite could not fetch a lazy route. Common causes: (1) `npm run dev` is down — restart it; (2) an extension blocked the request (console shows net::ERR_BLOCKED_BY_CLIENT) — disable ad blockers / privacy shields for localhost; (3) a stuck retry — clear sessionStorage keys starting with scholomance:lazy-reload: then hard-refresh.",
        detail: message,
      };
    }

    return {
      title: "App Updated",
      message: "A new deployment is available. Reload to sync your browser with the latest assets.",
      detail: message,
    };
  }

  return {
    title: "Unexpected Error",
    message: "Something went wrong while loading this page.",
    detail: message,
  };
}

export default function RouteErrorPage() {
  const error = useRouteError();
  const summary = getErrorSummary(error);

  return (
    <div className="container" style={{ paddingBlock: "6rem", textAlign: "center" }}>
      <div className="card card-elevated" style={{ marginInline: "auto", maxWidth: "52rem" }}>
        <h1 className="title" style={{ marginBottom: "1rem" }}>{summary.title}</h1>
        <p className="subtitle" style={{ marginInline: "auto", marginBottom: "2rem" }}>
          {summary.message}
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
          <a className="btn btn-secondary" href="/">
            Go Home
          </a>
        </div>
        {import.meta.env.DEV && summary.detail ? (
          <pre style={{ marginTop: "1.5rem", textAlign: "left", whiteSpace: "pre-wrap" }}>
            {summary.detail}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
