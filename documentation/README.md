# Technical documentation

This directory is the canonical home for technical documentation. It is organized so an engineer can understand the part they need without first reading the whole codebase.

## Start here

- [`ARCHITECTURE.md`](ARCHITECTURE.md) explains the system boundaries, platform bridge, module ownership, data model, build paths, and testing strategy. Read the relevant section before changing a subsystem or crossing a platform boundary.
- [`../CONSTITUTION.md`](../CONSTITUTION.md) is the binding source for product rules, engineering practices, and architectural decisions. It is not duplicated here.
- [`../ROADMAP.md`](../ROADMAP.md) records what is planned and shipped. It is not a design specification.

## Keeping this documentation useful

Update the smallest relevant document in the same change when implementation alters a module's responsibility, a data flow, a platform boundary, storage, a build path, or a verification strategy. Keep diagrams and module maps consistent with the code. Do not copy decisions, APIs, or file lists that already have a clearer authoritative location. Prefer links to duplication.

The architecture guide is a map, not an exhaustive reference. A reader should be able to start with the owning module, follow the documented boundary to its collaborators, and read only the nearby code needed for the change at hand.
