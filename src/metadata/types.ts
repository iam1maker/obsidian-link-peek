export interface LinkMetadata {
	/** The URL the metadata was resolved for (after redirects when known). */
	url: string;
	title: string | null;
	description: string | null;
	image: string | null;
	favicon: string | null;
	siteName: string | null;
	/** Content type of the response, e.g. "text/html" or "application/pdf". */
	contentType: string | null;
	/** oEmbed endpoint advertised by the page, used to fill gaps when OG tags are missing. */
	oembedUrl?: string | null;
}

/**
 * Why a lookup failed, so the card can say something more useful than the raw
 * message and offer the right next step.
 * - blocked: the site refused us (401/403/429/503, or a bot-challenge page)
 * - notfound: 404/410
 * - timeout: no response within the deadline
 * - http: any other non-2xx status
 * - network: DNS, TLS, connection reset, offline
 * - empty: a real page with no title and no description, nothing to show
 */
export type ErrorKind = "blocked" | "notfound" | "timeout" | "http" | "network" | "empty";

export type MetadataResult =
	| { ok: true; meta: LinkMetadata }
	| { ok: false; error: string; kind?: ErrorKind };
