# Handover: turn my thesis methods into Lab Bench Tracker protocols (format version 3)

You have already read my MSc submissions, including the methods. I use a web app called
Lab Bench Tracker to run protocols at the bench step by step. I want every method I used turned
into a protocol the app can import, so I do not have to type them in by hand.

**If you already produced a version 1 file:** the app has been changed in response to your first
feedback file. Please regenerate the JSON using the new fields below ("New since version 1"), so that
values you previously had to push into `description` or `comment` go into proper fields.

Please produce **two files**:

1. `lab-bench-protocols.json`: the protocols, in the exact format below. I upload this to the app.
2. `lab-bench-feedback.md`: where my methods still do not fit, using the template at the end.
   I give this to the developer of the app so the app can be changed to fit the methods.

Where a method does not fit, still put a best-fit version in the JSON, and describe the misfit in
the feedback file. Do not bend the science to fit the format.

## Ground rules

- Use only what is written in my methods. Do not fill gaps from general knowledge. If a volume,
  time or reagent is not stated, leave that field out and list it in the feedback file under
  "Missing from the source". Never write a midpoint or a guess.
- One protocol per distinct method. If one written method is really two procedures handing a
  processed sample from one to the next, split it and connect them with `previousProtocols`.
- Keep step descriptions short and practical, written as an instruction for someone at the bench.
  Do not copy long passages of the thesis.
- Keep the order exactly as performed.
- Output valid JSON only in the first file: no comments, no trailing commas, double quotes.

## New since version 1

| What | Field | Where |
|---|---|---|
| Many more step kinds | `kind` | `other` steps |
| Temperature | `temperature` | any step |
| Concentration, dilution or dose | `concentration` | any step, and each component |
| Amounts that are not volumes | `unit` now takes mass, length and more | any step, and each component |
| Several reagents in one step | `components` | any step |
| A time range | `minutes` + `minutesMax` | incubation, other |
| A step that ends on an observation | `until` | incubation, other |
| Equipment or instrument | `equipment` | any step |
| Washes without a count or a time | `times` and `minutesEach` are optional | wash |
| Notes for the whole protocol | `notes` | protocol |
| Ethics approval number | `ethicsApproval` | protocol |
| Needing two earlier protocols at once | `previousNeedsAll` | protocol |
| A protocol repeated on a schedule | `schedule` | protocol |
| A programmed run or thermal cycle | `cycle` | any step |
| A step that splits the sample | `produces` | any step |
| Which piece a later protocol starts from | `previousUses` | protocol |
| Seconds, and long holds | `minutes` may be a decimal (0.5) or large (10080 shows as 7 days) | incubation, other |

## How the app thinks about a protocol

- A **protocol** has a name and an ordered list of **steps**, plus optional `notes` and
  `ethicsApproval` that apply to all of it.
- A protocol may have **variants** (for example one per tissue, or one per treatment arm). Each
  variant has its own full list of steps. If there is only one way it was done, do not use variants.
- A protocol is one of three kinds, which the app works out:
  - **Reliant**: it needs a sample already processed by another protocol. Set
    `requiresPrevious: true` and name the earlier protocol(s) in `previousProtocols`, spelled
    exactly as their `name` in this file. By default any one of them is enough; set
    `previousNeedsAll: true` when every one of them is required.
  - **Initial**: another protocol names it in `previousProtocols`. Nothing to set.
  - **Entire**: runs from start to end on its own. Nothing to set.
- Every **step** is one of three types:
  - `wash`: a wash, optionally repeated (`times`) and timed (`minutesEach`).
  - `incubation`: the sample sits in something for a time or until something is seen.
  - `other`: anything else. It carries a `kind` from this list:
    `Pipette / add`, `Remove / aspirate`, `Resuspend`, `Homogenise / lyse`, `Centrifuge`, `Fix`,
    `Thaw`, `Storage`, `Section`, `Mount`, `Image / view`, `Collect / label`, `Inject`,
    `Anaesthetise`, `Euthanase`, `Dissect / excise`, `Measure / record`, `Instrument run`,
    `Calculate`, `Review / report`, `Custom`.
    Use `Custom` only as a last resort, and report each use in the feedback file.

## File 1 format: `lab-bench-protocols.json`

```json
{
  "format": "lab-bench-protocols",
  "version": 3,
  "protocols": [
    {
      "name": "Example reaction",
      "source": "MSc dissertation, section 3.12.2",
      "notes": "All steps on ice unless stated.",
      "ethicsApproval": "",
      "requiresPrevious": true,
      "previousProtocols": ["Example extraction", "Example quality control"],
      "previousNeedsAll": true,
      "steps": [
        {
          "type": "other",
          "kind": "Pipette / add",
          "description": "Assemble the reaction mix",
          "reagent": "5X Reaction Buffer",
          "amount": 4,
          "unit": "µL",
          "per": "sample",
          "temperature": "On ice",
          "components": [
            { "reagent": "dNTP mix", "amount": 2, "unit": "µL", "concentration": "10 mM" },
            { "reagent": "Template RNA", "amount": 1, "unit": "µg" }
          ],
          "comment": "Total volume 20 µL"
        },
        {
          "type": "incubation",
          "minutes": 45,
          "minutesMax": 60,
          "temperature": "42 °C",
          "equipment": "Thermal cycler",
          "handsFree": true
        },
        {
          "type": "incubation",
          "description": "Incubate with detachment enzyme",
          "reagent": "Example enzyme",
          "amount": 2,
          "unit": "mL",
          "per": "batch",
          "until": "the cells detach",
          "temperature": "37 °C"
        },
        {
          "type": "wash",
          "reagent": "PBS",
          "times": 3
        },
        {
          "type": "other",
          "kind": "Inject",
          "description": "Inject intraperitoneally",
          "reagent": "Example drug",
          "concentration": "20 mg/kg",
          "amount": 200,
          "unit": "µL",
          "per": "sample"
        }
      ]
    }
  ]
}
```

A protocol with variants uses `variants` instead of `steps`:

```json
{ "name": "Example dosing", "variants": [ { "name": "Vehicle control", "steps": [ ... ] }, { "name": "Drug A", "steps": [ ... ] } ] }
```

### Protocol fields

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Short name as the lab would say it. Unique in the file. Max 120 characters. |
| `source` | no | Where in my documents it comes from. Shown in the history. |
| `notes` | no | Anything true of the whole protocol ("all steps at room temperature", group sizes). Max 1000 characters. |
| `ethicsApproval` | no | The clearance number, for any protocol involving animals or people. |
| `requiresPrevious` | no | `true` if it starts from a sample another protocol has processed. |
| `previousProtocols` | no | Names of the protocol(s) the sample comes from. |
| `previousNeedsAll` | no | `true` if all of `previousProtocols` are needed; otherwise any one is enough. |
| `previousUses` | no | Which output of an earlier protocol this one starts from, as `{ "Earlier protocol name": "output label" }`. The label must match one of that protocol's `produces` labels exactly. |
| `schedule` | no | For a protocol repeated on the same samples or animals: `{ "repeats": 6, "everyDays": 7 }`. In a study the app then makes one round per repeat ("Week 1" to "Week 6") and shows when the next round is due. Do not add a "repeat this" step. For "three times a week" use `everyDays: 2` and say so in `notes`. If the number of repeats is not stated, leave `schedule` out and report it. |
| `steps` | yes, unless `variants` | The ordered steps. |
| `variants` | no | List of `{ "name", "steps" }`. Use instead of `steps`. |

### Step fields

| Field | Used by | Meaning |
|---|---|---|
| `type` | all | `"wash"`, `"incubation"` or `"other"`. |
| `kind` | other | One of the list above. |
| `description` | all | What to do, in one line (max 300 characters). May be left empty for a plain wash or incubation: the app then writes it, for example "Wash 3× in 5 mL PBS". For `other` steps always write it. |
| `reagent` | all | The **name** of the main reagent or solution. Same spelling every time it appears, across all protocols. |
| `reagentDependsOnTarget` | all | `true` when the reagent differs by gene or protein (primary antibody, primer pair). Then leave `reagent` out. |
| `amount` | all | Number only. Leave out if not stated. |
| `unit` | all | One of `mL`, `µL`, `L`, `g`, `mg`, `µg`, `ng`, `mg/kg`, `µm`, `mm`, `mm³`, `cm²`, `cells`, `U`. Only the volume units are counted against reagent stock. |
| `per` | all | `"sample"` if the amount is used for each sample, `"batch"` if once for the whole run. |
| `concentration` | all | Free text for concentration, dilution or dose: `"1:500"`, `"0.01 mg/mL"`, `"20 mg/kg"`, `"3.6 x 10^7 cells/mL"`. |
| `components` | all | Further reagents in the same step: a list of `{ "reagent", "amount", "unit", "concentration" }`. Put the main one in `reagent` and the rest here. Use this for reaction mixes and anything made of several parts; do not invent a made-up mix name any more. |
| `temperature` | all | Free text: `"37 °C"`, `"On ice"`, `"Room temperature"`, `"-80 °C"`, `"37 °C, 5% CO2"`. |
| `equipment` | all | The instrument or equipment named for the step. |
| `cycle` | all | A programmed run: `{ "cycles": 40, "stages": [ { "temperature": "95 °C", "time": "15 s" }, { "temperature": "60 °C", "time": "1 min" } ] }`. Leave `cycles` out if it runs once or the number is not stated. Use on one `Instrument run` step. |
| `produces` | all | When the step splits the sample or makes something later protocols start from: a list of short labels, for example `["Formalin-fixed piece", "RNAlater piece", "Snap-frozen piece"]`. |
| `times` | wash | How many washes. Leave out if not stated. |
| `minutesEach` | wash | Minutes per wash. Leave out if not stated. |
| `minutes` | incubation, other | Duration in minutes. Decimals allowed (30 seconds is 0.5). Leave out if not stated. For "overnight" use 960 and say "overnight" in `description`. |
| `minutesMax` | incubation, other | Only for a stated range: `minutes` is the lower end, `minutesMax` the upper. |
| `until` | incubation, other | The observation that ends the step, when the method gives one ("the cells detach", "70-80% confluent"). May be used with or without `minutes`. |
| `handsFree` | incubation, other | `true` if the person can walk away. |
| `checks` | all | Short things to tick off while doing the step. Also use for pass criteria ("viability above 95%"). |
| `comment` | all | Background the person should know that has no field: catalogue detail, cautions, replicate or image counts, formulas. Max 500 characters. |

### Still not supported: put in text and report it

The app still has no proper place for the following. Use `description`, `comment` or protocol
`notes`, and add an entry to the feedback file each time so they can be prioritised:

- how much of each produced piece is left for a given sample;
- a schedule that is not evenly spaced, or has no fixed number of repeats;
- thresholds that should raise an alert (welfare limits) rather than be ticked;
- a range for an amount (20-50 mL);
- formulas, software and replicate or image counts as their own fields;
- subjects (an animal, a cage) as distinct from samples.

## File 2 format: `lab-bench-feedback.md`

Use exactly these headings so the developer can work through it.

```markdown
# Lab Bench Tracker: protocol format feedback (version 3)

## Summary
- Protocols written: <number> (<number> steps)
- Steps typed `other` / `Custom`: <number> (list them)
- Protocols that fitted cleanly: <names>
- Protocols that needed workarounds: <names>

## What the new version fixed, and what it did not
For each misfit in the first feedback file: fixed / partly fixed / not fixed, in one line.

## Recurring misfits
One entry per kind of problem, most common first.

### <short title>
- How often: <number of steps> steps in <number> protocols
- Examples: <protocol name, step number> ; <protocol name, step number>
- What the method needs: <plain description>
- What I did in the JSON instead: <workaround used>
- Suggested change to the app: <new field, new step type, new option, with the values it should accept>

## Per-protocol notes
### <protocol name>
- Step <n>: <what did not fit, and what was done instead>
- Structure: <anything about ordering, parallel steps, split across days, variants>

## Missing from the source
- <protocol name>, step <n>: <what is missing>

## Reagent list
Every distinct reagent name used in the JSON (main reagents and components), one per line.
- <reagent name> | <brand> | <supplier or catalogue number> | <notes>

## Open questions for Zak
```

## Before you finish

- Check the JSON parses, every `previousProtocols` name matches a `name` in the file, and every
  step has a `type`.
- Check each reagent is spelled the same way everywhere, including inside `components`.
- Tell me how many protocols and steps are in the file, how many steps are still `Custom`, and
  which three misfits matter most.
