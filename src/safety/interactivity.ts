import { select } from "@inquirer/prompts";
import { settings } from "../config/index.js";

/**
 * Intercepts risky operations, checks configuration, and asks the user for confirmation.
 * Now supports "Allow Once" without permanently modifying the allowlist.
 */
export async function askForPermission(
    operation: "read" | "write" | "delete" | "execute",
    targetPath: string
): Promise<boolean> {
    // 1. Bypass if settings are set to auto (fully autonomous)
    if (settings.confirmationMode === "auto") return true;

    // 2. Read operations usually don't need confirmation
    if (operation === "read") return true;

    // 3. Check session allowlist
    const isAllowed = settings.allowListFiles.some(
        (rule) => rule.path === targetPath && (rule.operation === operation || rule.operation === "all")
    );
    if (isAllowed) return true;

    // 4. Prompt the human with options
    console.log(`\n🛡️  [SECURITY INTERVENTION]`);
    const answer = await select({
        message: `Agent wants to [${operation.toUpperCase()}] target: ${targetPath}\n  How do you want to proceed?`,
        choices: [
            {
                name: "✅ Allow Always (Updates config allowlist)",
                value: "allow_always",
                description: "Allows the operation and won't ask again for this file/operation.",
            },
            {
                name: "⏳ Allow Once (Do not update config)",
                value: "allow_once",
                description: "Allows the operation this single time. Will ask again next time.",
            },
            {
                name: "❌ Deny",
                value: "deny",
                description: "Blocks the agent from performing this action.",
            },
        ],
    });

    // 5. Handle the user's choice
    if (answer === "allow_always") {
        await settings.addFileRule({ path: targetPath, operation });
        console.log(`✅ [${targetPath}] added to session allowlist.\n`);
        return true;
    }

    if (answer === "allow_once") {
        console.log(`⏳ Operation allowed for this instance only.\n`);
        return true;
    }

    // Deny case
    console.log(`❌ Operation denied.\n`);
    return false;
}