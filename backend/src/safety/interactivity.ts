// backend/src/safety/interactivity.ts
import { EventEmitter } from "node:events";
import { configManager } from "../config/index.js";

// Global emitter to bridge deep tool execution with the Express HTTP stream
export const approvalEmitter = new EventEmitter();

// Store pending promises that are pausing the LangGraph execution
const pendingRequests = new Map<string, (decision: "allow_always" | "allow_once" | "deny") => void>();

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
        // Notify the frontend that an action was auto-approved
        approvalEmitter.emit("system_log", `✅ Auto-approved [${category}]: ${target} (Found in Allowlist)`);
        return true;
    }

    // 3. Pause execution and ask the Frontend UI
    const reqId = Date.now().toString() + Math.random().toString(36).substring(7);
    
    // Create a promise that pauses this tool's execution until resolve is called
    const decision = await new Promise<"allow_always" | "allow_once" | "deny">((resolve) => {
        pendingRequests.set(reqId, resolve);
        
        // Push the request to the frontend via SSE
        approvalEmitter.emit("permission_request", {
            id: reqId,
            category,
            operation,
            target,
            displayMessage
        });
    });

    // 4. Handle the Frontend's decision
    if (decision === "allow_always") {
        await configManager.addRule(category, { target, operation });
        approvalEmitter.emit("system_log", `🛡️ Added '${target}' to Allowlist.`);
        return true;
    }

    if (decision === "allow_once") {
        approvalEmitter.emit("system_log", `🛡️ Allowed '${target}' for this execution only.`);
        return true;
    }

    approvalEmitter.emit("system_log", `❌ Denied execution of '${target}'.`);
    return false;
}

// Function called by the new Express /api/approve route
export function resolvePermission(id: string, decision: "allow_always" | "allow_once" | "deny") {
    const resolveFn = pendingRequests.get(id);
    if (resolveFn) {
        resolveFn(decision);
        pendingRequests.delete(id); // Clean up
    }
}