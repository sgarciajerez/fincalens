import { LitElement } from "lit";
import { PageController } from "@open-cells/page-controller";

export abstract class FincaPage extends LitElement {
  protected pageController: PageController;
  constructor() {
    super();
    this.pageController = new PageController(this);
  }
  createRenderRoot() {
    return this;
  }
  protected onPageEnter() {
    void this.load();
  }
  protected onPageLeave() {}
  protected async load() {}
  protected message(error: unknown) {
    return error instanceof Error
      ? error.message
      : "No se pudo completar la solicitud.";
  }
}
