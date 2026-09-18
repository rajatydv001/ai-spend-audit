import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { getAuthNav, isAuthenticated } from "@/lib/nav";
import Navbar from "@/components/layout/navbar";

const signedInUser = {
  id: "u1",
  email: "jane@example.com",
  name: "Jane Doe",
  image: null,
};

describe("getAuthNav", () => {
  it("shows Sign in + Sign up for anonymous visitors", () => {
    const items = getAuthNav(null);
    expect(items).toEqual([
      { href: "/login", label: "Sign in", kind: "link" },
      { href: "/signup", label: "Sign up", kind: "cta" },
    ]);
  });

  it("shows only Dashboard for signed-in users", () => {
    const items = getAuthNav(signedInUser);
    expect(items).toEqual([{ href: "/dashboard", label: "Dashboard", kind: "cta" }]);
  });

  it("never shows Sign in / Sign up to an authenticated user", () => {
    const labels = getAuthNav(signedInUser).map((i) => i.label);
    expect(labels).not.toContain("Sign in");
    expect(labels).not.toContain("Sign up");
  });

  it("isAuthenticated narrows a user", () => {
    expect(isAuthenticated(null)).toBe(false);
    expect(isAuthenticated(signedInUser)).toBe(true);
  });
});

describe("landing Navbar renders auth-aware navigation", () => {
  it("renders Sign in and Sign up links with correct hrefs for anonymous visitors", () => {
    const html = renderToStaticMarkup(React.createElement(Navbar));

    expect(html).toContain('href="/login"');
    expect(html).toContain(">Sign in</a>");
    expect(html).toContain('href="/signup"');
    expect(html).toContain(">Sign up</a>");
    expect(html).not.toContain('href="/dashboard"');
  });

  it("renders a Dashboard link for signed-in users", () => {
    const html = renderToStaticMarkup(React.createElement(Navbar, { user: signedInUser }));

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain(">Dashboard</a>");
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/signup"');
  });

  it("does not leak the user's email anywhere in the nav markup", () => {
    const html = renderToStaticMarkup(React.createElement(Navbar, { user: signedInUser }));
    expect(html).not.toContain("jane@example.com");
  });
});