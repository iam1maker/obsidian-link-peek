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
}

export type MetadataResult =
	| { ok: true; meta: LinkMetadata }
	| { ok: false; error: string };
