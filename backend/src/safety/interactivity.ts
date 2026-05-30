import { select } from "@inquirer/prompts";
import { configManager } from "../config/index.js";

/**
 * Intercepts risky operations, checks configuration, and asks the user for confirmation.
 * Now supports "Allow Once" without permanently modifying the allowlist.
 */
export async function askForPermission(
    category: "files" | "commands" | "mcp",
    operation: "read" | "write" | "delete" | "execute" | "mcp" | "all",
    target: string,          // The actual path, base command, or tool name
    displayMessage: string   // The user-friendly prompt
): Promise<boolean> {
    // 1. Fully Autonomous bypass
    if (configManager.config.preferences.confirmationMode === "auto") return true;
    if (operation === "read") return true;

    // 2. Check session allowlist
    const rules = configManager.config.allowList[category];
    const isAllowed = rules.some((rule) => {
        const operationMatch = rule.operation === operation || rule.operation === "all";

        // If it's a command, allow it if it starts with the allowed target (e.g., "pulumi")
        if (category === "commands") {
            return target.startsWith(rule.target) && operationMatch;
        }

        // Otherwise require exact match for files/mcp
        return rule.target === target && operationMatch;
    });

    if (isAllowed) return true;

    // 3. Prompt the human
    console.log(`\n🛡️  [SECURITY INTERVENTION]`);
    const answer = await select({
        message: `${displayMessage}\n  How do you want to proceed?`,
        choices: [
            {
                name: `✅ Allow Always (Updates allowlist for '${target}')`,
                value: "allow_always",
            },
            {
                name: "⏳ Allow Once",
                value: "allow_once",
            },
            {
                name: "❌ Deny",
                value: "deny",
            },
        ],
    });

    if (answer === "allow_always") {
        await configManager.addRule(category, { target, operation });
        console.log(`✅ ['${target}'] added to session allowlist.\n`);
        return true;
    }

    if (answer === "allow_once") {
        console.log(`⏳ Operation allowed for this instance only.\n`);
        return true;
    }

    console.log(`❌ Operation denied.\n`);
    return false;
}