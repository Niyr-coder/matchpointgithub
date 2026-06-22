import { describe, expect, it } from "vitest";
import {
  formatPersonNameInput,
  formatPhoneInput,
  isOnboardingIdentityComplete,
  parsePersonName,
} from "@/lib/identity/person-name";

describe("parsePersonName", () => {
  it("parte nombre y apellido", () => {
    expect(parsePersonName("vicente maldonado")).toEqual({
      firstName: "Vicente",
      lastName: "Maldonado",
      displayName: "Vicente Maldonado",
    });
  });

  it("acepta nombre simple sin apellido", () => {
    expect(parsePersonName("andre")).toEqual({
      firstName: "Andre",
      lastName: "",
      displayName: "Andre",
    });
  });
});

describe("formatPersonNameInput", () => {
  it("capitaliza palabras al escribir", () => {
    expect(formatPersonNameInput("maria jose")).toBe("Maria Jose");
  });
});

describe("formatPhoneInput", () => {
  it("filtra letras", () => {
    expect(formatPhoneInput("+593 abc99")).toBe("+593 99");
  });
});

describe("isOnboardingIdentityComplete", () => {
  it("requiere username y first_name", () => {
    expect(
      isOnboardingIdentityComplete({ username: "vicente", first_name: "Vicente" }),
    ).toBe(true);
    expect(
      isOnboardingIdentityComplete({ username: "vicente", first_name: null }),
    ).toBe(false);
  });
});
