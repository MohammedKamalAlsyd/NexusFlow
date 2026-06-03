import { configManager } from "../config/index.js";
import { executionContext } from "./executionContext.js";

export async function askForPermission(
    category: "files" | "commands" | "mcp",
    operation: "read" | "write" | "delete" | "execute" | "mcp" | "all",
    target: string,
    displayMessage: string
): Promise<boolean> {

    // 1. Fully Autonomous bypass
    if (configManager.config.preferences.confirmationMode === "auto") return true;
    if (operation === "read") return true;

    // 2. Check session allowlist
    const rules = configManager.config.allowList[category] || [];
    const isAllowed = rules.some((rule) => {
        const operationMatch = rule.operation === operation || rule.operation === "all";
        if (category === "commands") {
            return target.startsWith(rule.target) && operationMatch;
        }
        return rule.target === target && operationMatch;
    });

    if (isAllowed) {
        systemLog(`✅ Auto-approved [${category}]: ${target} (Found in Allowlist)`);
        return true;
    }

    // 3. Request Permission via Active WebSocket
    const store = executionContext.getStore();

    if (!store?.socket) {
        console.warn("⚠️ No active socket found for this execution. Denying permission for safety.");
        return false;
    }

    try {
        // Socket.io .timeout() wrapper alters the return type to an Array. 
        const rawResponse = await store.socket.timeout(300000).emitWithAck("permission_request", {
            category,
            operation,
            target,
            displayMessage
        });

        // CRITICAL FIX: Extract the string if it was returned as an array
        const decision = Array.isArray(rawResponse) ? rawResponse[0] : rawResponse;

        // 4. Handle the Frontend's decision
        if (decision === "allow_always") {
            await configManager.addRule(category, { target, operation });
            systemLog(`🛡️ Added '${target}' to Allowlist.`);
            return true;
        }

        if (decision === "allow_once") {
            systemLog(`🛡️ Allowed '${target}' for this execution only.`);
            return true;
        }

        systemLog(`❌ Denied execution of '${target}'.`);
        return false;

    } catch (error) {
        systemLog(`❌ Permission request timed out or failed.`);
        return false;
    }
}

// Helper to push logs directly to the user's specific frontend chat UI
export function systemLog(message: string) {
    const store = executionContext.getStore();
    if (store?.socket) {
        store.socket.emit("system_log", { message });
    }
    // Fallback to console for backend debugging
    console.log(message);
}