export class GraphicForgeMicroprocessor {
  constructor({ id, version }) {
    this.id = id;
    this.version = version;
  }

  run({ intent, input, context }) {
    throw new Error("Microprocessor must implement run().");
  }
}
