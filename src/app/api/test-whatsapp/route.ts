import { NextResponse } from "next/server";
import { getWhatsAppEnvConfig } from "@/lib/server/whatsapp-client";

export const runtime = "nodejs";

export async function GET() {
    try {
        const aisensyKey = process.env.AISENSY_API_KEY || "";
        const aisensyUrl = process.env.AISENSY_URL || "https://backend.aisensy.com/campaign/t1/api/v2";

        // Prefer AiSensy diagnostics because production notifications use this provider.
        if (aisensyKey) {
            const parsedAisensyUrl = new URL(aisensyUrl);
            if (parsedAisensyUrl.protocol !== "https:") {
                return NextResponse.json(
                    {
                        success: false,
                        reachable: false,
                        provider: "aisensy",
                        error: "AISENSY_URL must use HTTPS",
                    },
                    { status: 400 }
                );
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30_000);

            const probePayload = {
                apiKey: aisensyKey,
                campaignName: "CONNECTIVITY_TEST",
                destination: "919999999999",
                userName: "connectivity-test",
                templateParams: ["connectivity-test"],
                source: "EditoHub-Test",
            };

            const response = await fetch(parsedAisensyUrl.toString(), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(probePayload),
                signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));

            const rawBody = await response.text();
            let parsedBody: unknown = rawBody;
            try {
                parsedBody = JSON.parse(rawBody);
            } catch {
                // keep raw string
            }

            // Any HTTP response from AiSensy means network connectivity is working.
            const reachable = response.status > 0;
            if (!response.ok) {
                console.error("[WhatsApp][test endpoint][aisensy] non-OK response", {
                    status: response.status,
                    body: parsedBody,
                    endpoint: parsedAisensyUrl.toString(),
                });
            }

            return NextResponse.json(
                {
                    success: reachable,
                    reachable,
                    provider: "aisensy",
                    status: response.status,
                    endpoint: parsedAisensyUrl.toString(),
                    response: parsedBody,
                    hint: "If reachable=true with non-2xx, network is fine and request payload/campaign config should be checked.",
                },
                { status: reachable ? 200 : 502 }
            );
        }

        const envCheck = getWhatsAppEnvConfig();
        if (!envCheck.valid || !envCheck.config) {
            return NextResponse.json(
                {
                    success: false,
                    reachable: false,
                    provider: "meta-graph",
                    error: "Missing WhatsApp environment variables",
                    missing: envCheck.missing,
                },
                { status: 500 }
            );
        }

        const baseUrl = envCheck.config.apiUrl || "https://graph.facebook.com/v21.0";
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== "https:") {
            return NextResponse.json(
                {
                    success: false,
                    reachable: false,
                    provider: "meta-graph",
                    error: "WHATSAPP_API_URL must use HTTPS",
                },
                { status: 400 }
            );
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);

        const endpoint = `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}/${envCheck.config.phoneNumberId}`;
        const response = await fetch(endpoint, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${envCheck.config.token}`,
                "Content-Type": "application/json",
            },
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        const rawBody = await response.text();
        let parsedBody: unknown = rawBody;
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            // keep raw string
        }

        if (!response.ok) {
            console.error("[WhatsApp][test endpoint] non-OK response", {
                status: response.status,
                body: parsedBody,
                endpoint,
            });
        }

        return NextResponse.json(
            {
                success: response.ok,
                reachable: response.ok,
                provider: "meta-graph",
                status: response.status,
                endpoint,
                response: parsedBody,
                hint: response.ok
                    ? "Connectivity to graph.facebook.com looks good"
                    : "If this fails only in production, ensure host allows outbound HTTPS to graph.facebook.com",
            },
            { status: response.ok ? 200 : 502 }
        );
    } catch (error) {
        const err = error as Error;
        console.error("[WhatsApp][test endpoint] request failed", {
            message: err?.message,
            stack: err?.stack,
        });

        return NextResponse.json(
            {
                success: false,
                reachable: false,
                provider: "meta-graph",
                error: err?.message || "Unexpected connectivity error",
            },
            { status: 500 }
        );
    }
}
