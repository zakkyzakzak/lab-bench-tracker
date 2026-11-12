# Handover: turn my thesis methods into Lab Bench Tracker protocols

You have already read my MSc submissions, including the methods. I use a web app called
Lab Bench Tracker to run protocols at the bench step by step. I want every method I used turned
into a protocol the app can import, so I do not have to type them in by hand.

Please produce **two files**:

1. `lab-bench-protocols.json`: the protocols, in the exact format below. I upload this to the app.
2. `lab-bench-feedback.md`: where my methods did not fit the format, using the template at the end.
   I give this to the developer of the app so the app can be changed to fit the methods.

Both matter equally. Where a method does not fit, still put a best-fit version in the JSON, and
describe the misfit in the feedback file. Do not bend the science to fit the format.

## Ground rules

- Use only what is written in my methods. Do not fill gaps from general knowledge. If a volume,
  time or reagent is not stated, leave that field out (or `null`) and list it in the feedback file
  under "Missing from the source".
- One protocol per distinct method (for example tissue processing, a stain, an assay, an extraction).
  If one written method is really two procedures done on different days or handing a processed
  sample from one to the next, split it and connect them with `previousProtocols` (see below).
- Keep step descriptions short and practical, written as an instruction for someone at the bench.
  Do not copy long passages of the thesis.
- Keep the order exactly as performed.
- Output valid JSON only in the first file: no comments, no trailing commas, double quotes.

## How the app thinks about a protocol

- A **protocol** has a name and an ordered list of **steps**.
- A protocol may have **variants** (for example "Liver" and "Adipose", or "Paraffin sections" and
  "Frozen sections") when the same method was run with different steps or amounts. Each variant has
  its own full list of steps. If there is only one way it was done, do not use variants.
- A protocol is one of three kinds, which the app works out from two fields:
  - **Reliant**: it needs a sample already processed by another protocol (for example IHC needs
    FFPE sections). Set `requiresPrevious: true` and name the earlier protocol(s) in
    `previousProtocols`, spelled exactly as their `name` in this file.
  - **Initial**: another protocol names it in `previousProtocols`. Nothing to set.
  - **Entire**: runs from start to end on its own (for example a serum ALT/AST assay). Nothing to set.
- Every **step** is one of three types:
  - `wash`: the same wash repeated a number of times (`times`, `minutesEach`).
  - `incubation`: the sample sits in something for a time (`minutes`), usually hands-free.
  - `other`: anything else. It must carry a `kind` from this fixed list:
    `Mount`, `Image / view`, `Storage`, `Thaw`, `Fix`, `Centrifuge`, `Collect / label`, `Custom`.
    Use `Custom` when none fits, and say what it really is in `description`.

## File 1 format: `lab-bench-protocols.json`

```json
{
  "format": "lab-bench-protocols",
  "version": 1,
  "protocols": [
    {
      "name": "Example stain",
      "source": "MSc dissertation, section 2.4.1",
      "requiresPrevious": true,
      "previousProtocols": ["Example tissue processing"],
      "steps": [
        {
          "type": "wash",
          "description": "",
          "reagent": "PBS",
          "amount": 5,
          "unit": "mL",
          "per": "sample",
          "times": 3,
          "minutesEach": 5,
          "checks": [],
          "comment": ""
        },
        {
          "type": "incubation",
          "description": "Incubate in primary antibody at 4 °C overnight",
          "reagentDependsOnTarget": true,
          "amount": 100,
          "unit": "µL",
          "per": "sample",
          "minutes": 960,
          "handsFree": true,
          "checks": ["Slides kept in a humid chamber"],
          "comment": "Dilution 1:200 in blocking buffer"
        },
        {
          "type": "other",
          "kind": "Mount",
          "description": "Mount with coverslip",
          "reagent": "Mounting medium",
          "minutes": 5,
          "handsFree": false
        }
      ]
    }
  ]
}
```

A protocol with variants uses `variants` instead of `steps`:

```json
{
  "name": "Example extraction",
  "variants": [
    { "name": "Liver", "steps": [ ... ] },
    { "name": "Adipose", "steps": [ ... ] }
  ]
}
```

### Protocol fields

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Short name as the lab would say it. Must be unique in the file. Max 120 characters. |
| `source` | no | Where in my documents it comes from (document and section). Shown in the history. |
| `requiresPrevious` | no | `true` if it starts from a sample another protocol has processed. |
| `previousProtocols` | no | Names of the protocol(s) the sample comes from. Any one of them is enough. |
| `steps` | yes, unless `variants` | The ordered steps. |
| `variants` | no | List of `{ "name", "steps" }`. Use instead of `steps`. |

### Step fields

| Field | Used by | Meaning |
|---|---|---|
| `type` | all | `"wash"`, `"incubation"` or `"other"`. |
| `kind` | other | One of the fixed list above. |
| `description` | all | What to do, in one line (max 300 characters). May be left empty for a plain wash or incubation: the app then writes it from the other fields, for example "Wash 3× in 5 mL PBS". For `other` steps always write it. |
| `reagent` | all | The **name** of the main reagent or solution for the step, for example `"PBS"` or `"10% neutral buffered formalin"`. Use the same spelling every time the same reagent appears, across all protocols. Leave out if there is none. Only one reagent per step. |
| `reagentDependsOnTarget` | all | `true` when the reagent differs by gene or protein (a primary antibody, a primer pair, a probe). Then leave `reagent` out. |
| `amount` | all | Number only: volume of that reagent used. Leave out if not stated. |
| `unit` | all | `"mL"` or `"µL"` only. Anything else (g, mg, units, %) cannot go here: put it in `description` and report it in the feedback. |
| `per` | all | `"sample"` if that amount is used for each sample, `"batch"` if once for the whole run. |
| `times` | wash | How many washes. |
| `minutesEach` | wash | Minutes per wash. |
| `minutes` | incubation, other | Duration in minutes. Convert hours. For "overnight" use 960 and say "overnight" in `description`. |
| `handsFree` | incubation, other | `true` if the person can walk away (incubator, centrifuge run, drying). `false` if they are working the whole time. |
| `checks` | all | Short things to tick off while doing the step, for example "Kept in the dark". Optional. |
| `comment` | all | Anything the person running it should know that is not an instruction: concentration, dilution, temperature, speed, catalogue detail, caution. Max 500 characters. |

### Things the format has no field for

There is no separate field for temperature, centrifuge speed, concentration or dilution, pH,
equipment, a second reagent in the same step, how a buffer is made up, steps repeated as a cycle,
steps done only under a condition, or quantities by weight. For now:

- put temperature, speed and similar into `description` when it is part of the instruction
  ("Centrifuge at 12 000 × g, 4 °C"), and into `comment` when it is background;
- give a made-up solution one name as its `reagent` (for example "Blocking buffer") and put its
  recipe in `comment` the first time it appears;
- write a repeated cycle out as separate steps if it is short, or as one step with the cycle
  described if it is long (for example PCR cycling);
- and in every such case **add an entry to the feedback file**. That is how the app gets improved.

## File 2 format: `lab-bench-feedback.md`

Use exactly these headings so the developer can work through it.

```markdown
# Lab Bench Tracker: protocol format feedback

## Summary
- Protocols written: <number>
- Protocols that fitted cleanly: <names>
- Protocols that needed workarounds: <names>

## Recurring misfits
One entry per kind of problem, most common first.

### <short title, e.g. "No field for temperature">
- How often: <number of steps> steps in <number> protocols
- Examples: <protocol name, step number> ; <protocol name, step number>
- What the method needs: <plain description>
- What I did in the JSON instead: <workaround used>
- Suggested change to the app: <new field, new step type, new option, with the values it should accept>

## Step types or kinds that are missing
For each: the name you would give it, what fields it needs, and which steps would use it.

## Per-protocol notes
### <protocol name>
- Step <n>: <what did not fit, and what was done instead>
- Structure: <anything about ordering, parallel steps, split across days, variants>

## Missing from the source
Values the app wants that my methods do not state.
- <protocol name>, step <n>: <what is missing, e.g. volume not stated>

## Reagent list
Every distinct `reagent` name used in the JSON, one per line, with any brand, supplier or catalogue
number given in my methods. This becomes the lab's reagent list.
- <reagent name> | <brand> | <supplier or catalogue number> | <notes>

## Open questions for Zak
Anything you had to guess, or where two readings of the methods were possible.
```

## Before you finish

- Check the JSON parses, every `previousProtocols` name matches a `name` in the file, and every
  step has a `type`.
- Check each reagent is spelled the same way everywhere.
- Tell me how many protocols and steps are in the file, and which three misfits matter most.
