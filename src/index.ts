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

		const generateUniqueCode = async (firstName: string, lastName: string): Promise<string> => {
			const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
			const baseCode = (firstName.slice(0, 3) + lastName.slice(0, 3)).toUpperCase();

			let code = baseCode;
			let attempt = 0;
			const maxAttempts = 100;

			while (attempt < maxAttempts) {
				const existing = await env.DB.prepare(
					"SELECT code FROM affiliates WHERE code = ?",
				)
					.bind(code)
					.first();

				if (!existing) {
					return code;
				}

				// Add random characters with numbers
				const randomSuffix = Array.from({ length: 3 }, () =>
					chars[Math.floor(Math.random() * chars.length)]
				).join("");
				code = baseCode + randomSuffix;
				attempt++;
			}

			// Fallback: fully random code
			return Array.from({ length: 8 }, () =>
				chars[Math.floor(Math.random() * chars.length)]
			).join("");
		};

		const url = new URL(request.url);

		if (url.pathname === "/create" && request.method === "POST") {
			try {
				const body = await request.json();
				const { first_name, last_name, email, phone, instagram } = body;

				if (!first_name || !last_name || !email || !phone) {
					return jsonResponse(
						{
							success: false,
							error: "Champs requis manquants",
						},
						400,
					);
				}

				const conflict = await env.DB.prepare(
					"SELECT code, email, phone, instagram FROM affiliates WHERE email = ? OR phone = ? OR instagram = ? LIMIT 1",
				)
					.bind(email, phone, instagram || null)
					.first();

				if (conflict) {
					let field = "email/téléphone/instagram";
					if (conflict.email === email) field = "email";
					else if (conflict.phone === phone) field = "téléphone";
					else if (conflict.instagram === instagram) field = "instagram";

					return jsonResponse(
						{
							success: false,
							error: `Cet affilié existe déjà`,
							code: conflict.code,
						},
						409,
					);
				}

				// Generate unique code
				const code = await generateUniqueCode(first_name, last_name);

				await env.DB.prepare(
					"INSERT INTO affiliates (code, first_name, last_name, email, phone, instagram, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))",
				)
					.bind(code, first_name, last_name, email, phone, instagram || null)
					.run();

				// Send Discord notification
				try {
					const discordPayload = {
						embeds: [
							{
								title: "🎉 Nouvel affilié enregistré",
								color: 0x00ff00,
								fields: [
									{
										name: "Code",
										value: code,
										inline: true,
									},
									{
										name: "Nom",
										value: `${first_name} ${last_name}`,
										inline: true,
									},
									{
										name: "Email",
										value: email,
										inline: false,
									},
									{
										name: "Téléphone",
										value: phone,
										inline: true,
									},
									...(instagram
										? [
												{
													name: "Instagram",
													value: instagram,
													inline: true,
												},
											]
										: []),
								],
								timestamp: new Date().toISOString(),
							},
						],
					};

					await fetch(env.DISCORD_WEBHOOK_URL, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(discordPayload),
					});
				} catch (discordError) {
					console.error("Failed to send Discord notification:", discordError);
					// Continue execution even if Discord notification fails
				}

				return jsonResponse({
					success: true,
					code,
				});
			} catch (e) {
				const message = e instanceof Error ? e.message : "Erreur inconnue";
				return jsonResponse(
					{
						success: false,
						error: "Erreur interne du serveur",
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
