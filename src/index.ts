export default {
	async fetch(request, env) {
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		const jsonResponse = (data: unknown, status = 200) =>
			new Response(JSON.stringify(data), {
				status,
				headers: {
					"content-type": "application/json",
					...corsHeaders,
				},
			});

		const url = new URL(request.url);

		if (url.pathname === "/create" && request.method === "POST") {
			try {
				const body = await request.json();
				const { code, first_name, last_name, email, phone, instagram } = body;

				if (!code || !first_name || !last_name || !email || !phone) {
					return jsonResponse(
						{
							success: false,
							error: "Missing required fields",
						},
						400,
					);
				}

				const existing = await env.DB.prepare(
					"SELECT code FROM affiliates WHERE code = ?",
				)
					.bind(code)
					.first();

				if (existing) {
					return jsonResponse(
						{
							success: false,
							error: "Code already exists",
						},
						409,
					);
				}

				const conflict = await env.DB.prepare(
					"SELECT email, phone, instagram FROM affiliates WHERE email = ? OR phone = ? OR instagram = ? LIMIT 1",
				)
					.bind(email, phone, instagram || null)
					.first();

				if (conflict) {
					let field = "email/phone/instagram";
					if (conflict.email === email) field = "email";
					else if (conflict.phone === phone) field = "phone";
					else if (conflict.instagram === instagram) field = "instagram";

					return jsonResponse(
						{
							success: false,
							error: `An affiliate with this ${field} already exists`,
						},
						409,
					);
				}

				await env.DB.prepare(
					"INSERT INTO affiliates (code, first_name, last_name, email, phone, instagram, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))",
				)
					.bind(code, first_name, last_name, email, phone, instagram || null)
					.run();

				return jsonResponse({
					success: true,
					code,
				});
			} catch (e) {
				const message = e instanceof Error ? e.message : "Unknown error";
				return jsonResponse(
					{
						success: false,
						error: "Internal server error",
						details: message,
					},
					500,
				);
			}
		}

		return new Response("OK - Linkio Affiliate API", {
			status: 200,
			headers: corsHeaders,
		});
	},
} satisfies ExportedHandler<Env>;
