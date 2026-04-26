import readline from "readline";
import { findUserByUsername, listUsers, updateUserPassword } from "@/lib/db/users";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptSecret(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin as NodeJS.ReadStream;
    const isTTY = stdin.isTTY === true && typeof stdin.setRawMode === "function";

    if (!isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    const onData = (char: string) => {
      if (char === "\r" || char === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
      } else if (char === "") {
        cleanup();
        process.stdout.write("\n");
        reject(new Error("Cancelled"));
      } else if (char === "" || char === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (char >= " ") {
        value += char;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const usernameArg = args[0];

  let username = usernameArg;

  if (!username) {
    const users = listUsers();
    if (users.length === 0) {
      console.error("No users found in the database.");
      process.exit(1);
    }
    console.log("Users:");
    for (const u of users) {
      console.log(`  ${u.username} (${u.role})`);
    }
    username = await prompt("\nUsername to reset: ");
  }

  if (!username) {
    console.error("Username is required.");
    process.exit(1);
  }

  const user = findUserByUsername(username);
  if (!user) {
    console.error(`User '${username}' not found.`);
    process.exit(1);
  }

  console.log(`Resetting password for: ${user.username} (${user.role})`);

  const password = await promptSecret("New password: ");
  if (!password) {
    console.error("Password cannot be empty.");
    process.exit(1);
  }
  if (password.length < 4) {
    console.error("Password must be at least 4 characters.");
    process.exit(1);
  }

  const confirm = await promptSecret("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  const ok = await updateUserPassword(user.id, password);
  if (!ok) {
    console.error("Failed to update password.");
    process.exit(1);
  }

  console.log(`✓ Password updated for '${user.username}'.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
