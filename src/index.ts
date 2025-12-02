export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/create" && request.method === "POST") {
			try {
				const body = await request.json();
				const { code, first_name, last_name, email, phone, instagram } = body;

				if (!code || !first_name || !last_name || !email || !phone) {
					return new Response(
						JSON.stringify({
							success: false,
							error: "Missing required fields",
						}),
						{
							status: 400,
							headers: {
								"content-type": "application/json",
							},
						},
					);
				}

				const existing = await env.DB.prepare(
					"SELECT code FROM affiliates WHERE code = ?",
				)
					.bind(code)
					.first();

				if (existing) {
					return new Response(
						JSON.stringify({
							success: false,
							error: "Code already exists",
						}),
						{
							status: 409,
							headers: {
								"content-type": "application/json",
							},
						},
					);
				}

				await env.DB.prepare(
					"INSERT INTO affiliates (code, first_name, last_name, email, phone, instagram, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))",
				)
					.bind(code, first_name, last_name, email, phone, instagram || null)
					.run();

				return new Response(
					JSON.stringify({
						success: true,
						code,
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json",
						},
					},
				);
			} catch (e) {
				const message = e instanceof Error ? e.message : "Unknown error";
				return new Response(
					JSON.stringify({
						success: false,
						error: "Internal server error",
						details: message,
					}),
					{
						status: 500,
						headers: {
							"content-type": "application/json",
						},
					},
				);
			}
		}

		return new Response("OK - Linkio Affiliate API", { status: 200 });
	},
} satisfies ExportedHandler<Env>;
