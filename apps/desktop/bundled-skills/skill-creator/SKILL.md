---
name: skill-creator
description: Guide for creating effective skills. Use when users want to create a new skill (or update an existing skill) that extends the AI's capabilities with specialized knowledge, workflows, or tool integrations.
command: /skill-creator
verified: true
hidden: true
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained packages that extend AI capabilities by providing
specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific
domains or tasks—they transform a general-purpose agent into a specialized agent
equipped with procedural knowledge.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good. Skills share the context window with everything else needed: system prompt, conversation history, other Skills' metadata, and the actual user request.

**Default assumption: The AI is already very smart.** Only add context it doesn't already have. Challenge each piece of information: "Is this explanation really needed?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

**High freedom (text-based instructions)**: Use when multiple approaches are valid, decisions depend on context, or heuristics guide the approach.

**Medium freedom (pseudocode or scripts with parameters)**: Use when a preferred pattern exists, some variation is acceptable, or configuration affects behavior.

**Low freedom (specific scripts, few parameters)**: Use when operations are fragile and error-prone, consistency is critical, or a specific sequence must be followed.

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   ├── description: (required)
│   │   └── command: (optional, e.g., /my-skill)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation loaded as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md (required)

Every SKILL.md consists of:

- **Frontmatter** (YAML): Contains `name`, `description`, and optional `command` fields. These determine when the skill gets used—be clear and comprehensive.
- **Body** (Markdown): Instructions and guidance for using the skill. Only loaded AFTER the skill triggers.

#### Bundled Resources (optional)

##### Scripts (`scripts/`)

Executable code for tasks requiring deterministic reliability or that are repeatedly rewritten.

- **When to include**: When the same code is being rewritten repeatedly or deterministic reliability is needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks

##### References (`references/`)

Documentation and reference material loaded as needed into context.

- **When to include**: For documentation that should be referenced while working
- **Examples**: `references/schema.md` for database schemas, `references/api_docs.md` for API specifications

##### Assets (`assets/`)

Files not intended to be loaded into context, but used within the output.

- **When to include**: When the skill needs files for the final output
- **Examples**: `assets/logo.png` for brand assets, `assets/template.html` for boilerplate

## Skill Creation Process

1. **Understand the skill** - Gather concrete examples of how the skill will be used
2. **Plan contents** - Identify what scripts, references, and assets would be helpful
3. **Create the skill directory** - Set up the folder structure
4. **Write SKILL.md** - Include frontmatter and instructions
5. **Verify creation** - MANDATORY: Confirm file exists at correct path with valid content
6. **Test and iterate** - Use the skill on real tasks and improve

### Step 1: Understanding the Skill

To create an effective skill, understand concrete examples of how it will be used:

- "What functionality should this skill support?"
- "Can you give examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

### Step 2: Planning Contents

Analyze each example to identify reusable resources:

1. Consider how to execute the example from scratch
2. Identify what scripts, references, and assets would help

### Step 3: Create the Skill

Create a new directory for your skill:

```
my-skill/
├── SKILL.md
└── (optional resources)
```

### Step 4: Write SKILL.md

**Frontmatter:**

```yaml
---
name: my-skill
description: Clear description of what the skill does and when to use it.
command: /my-skill
---
```

**Body:**

Write clear instructions for using the skill. Include:
- Overview of the skill's purpose
- Step-by-step workflows
- Examples when helpful
- References to any bundled resources

### Step 5: Test and Iterate

After creating the skill:
1. Use it on real tasks
2. Notice struggles or inefficiencies
3. Update SKILL.md or bundled resources
4. Test again

## Saving Skills in Accomplish

**IMPORTANT:** When creating skills in Accomplish, you can ONLY create "custom" skills. You CANNOT create "official" skills - those are bundled with the app and managed by the Accomplish team.

### User Skills Directory

**CRITICAL: You MUST save skills to EXACTLY this path. Do NOT ask the user where to save - the path is fixed by the app.**

Skills must be saved to the Accomplish user data directory under a `skills` folder:

**macOS:** `~/Library/Application Support/Accomplish/skills/<skill-name>/SKILL.md`
**Windows:** `%APPDATA%\Accomplish\skills\<skill-name>\SKILL.md`
**Linux:** `~/.config/Accomplish/skills/<skill-name>/SKILL.md`

**NEVER:**
- Ask the user where to save the skill file
- Use any other path like `~/skills/`, `./skills/`, or custom paths
- Offer the user choices about the save location

The path is determined by the operating system. Detect the OS and use the correct path automatically.

### How to Save a Skill

**Do not ask the user for a path. Follow these steps automatically:**

1. **Detect the operating system** to determine the correct base path:
   - macOS: `~/Library/Application Support/Accomplish/skills/`
   - Windows: `%APPDATA%\Accomplish\skills\`
   - Linux: `~/.config/Accomplish/skills/`

2. **Create the skill directory** named after your skill (lowercase, hyphenated):
   ```
   <base-path>/my-awesome-skill/
   ```

3. **Write the SKILL.md file** inside that directory:
   ```
   <base-path>/my-awesome-skill/SKILL.md
   ```

4. **Add any bundled resources** as subdirectories if needed:
   ```
   <base-path>/my-awesome-skill/
   ├── SKILL.md
   ├── scripts/
   ├── references/
   └── assets/
   ```

5. **The skill is automatically detected** - Accomplish scans this directory on startup and syncs new skills to its database. The skill will appear in Settings > Skills as a "Custom" skill.

### Skill Frontmatter Rules

For custom skills in Accomplish:
- `name`: Required - the skill's display name
- `description`: Required - when to use this skill
- `command`: Optional - slash command like `/my-skill`
- **DO NOT use** `verified: true` - only official skills can be verified
- **DO NOT use** `hidden: true` - only internal skills should be hidden

### Example Custom Skill

```yaml
---
name: my-awesome-skill
description: Does something awesome. Use when users want to do awesome things.
command: /awesome
---
```

### After Creating - MANDATORY VERIFICATION

**IMPORTANT:** You MUST verify the skill was created correctly before telling the user it's complete.

#### Verification Steps (Required)

1. **Read the file** - Use the Read tool to read the SKILL.md file you just created. This confirms:
   - The file actually exists
   - The content was written correctly

2. **Verify the path** - Confirm the file path matches the required location:
   - macOS: `~/Library/Application Support/Accomplish/skills/<skill-name>/SKILL.md`
   - Windows: `%APPDATA%\Accomplish\skills\<skill-name>\SKILL.md`
   - Linux: `~/.config/Accomplish/skills/<skill-name>/SKILL.md`

3. **Validate frontmatter** - Confirm the YAML frontmatter contains:
   - `name`: Present and non-empty
   - `description`: Present and non-empty
   - No forbidden fields (`verified: true` or `hidden: true`)

4. **Report results** - Only after ALL checks pass, tell the user:
   - The skill has been saved to their skills directory
   - Show the exact path where it was saved
   - Click the **refresh button** (↻) in Settings > Skills or in the + menu to detect the new skill
   - They can enable/disable or delete custom skills from the Settings panel

**If verification fails:** Do NOT tell the user the skill was created. Instead, diagnose the issue and fix it before re-verifying.

## Example: Creating a Simple Skill

Here's a minimal skill example:

```markdown
---
name: greeting-generator
description: Generate personalized greetings for various occasions. Use when users want help writing greeting cards, welcome messages, or celebratory notes.
command: /greet
---

# Greeting Generator

Generate warm, personalized greetings for any occasion.

## Usage

1. Ask what type of greeting is needed (birthday, holiday, thank you, etc.)
2. Gather details about the recipient
3. Generate multiple greeting options
4. Refine based on feedback

## Tone Guidelines

- **Formal**: Professional settings, business relationships
- **Warm**: Friends and family
- **Playful**: Children, casual occasions

## Examples

**Birthday greeting:**
"Wishing you a day filled with joy and a year filled with success!"

**Thank you note:**
"Your thoughtfulness means more than words can express. Thank you!"
```
