import { describe, expect, it } from "vitest";
import { departmentFor, inDepartment, parseDepartment, pathInDepartment } from "@/lib/department";
import { effectiveFeedGroups, feedGroupsFor } from "@/lib/feed";
import { groupsFor } from "@/lib/notifications";

describe("department view (founder only)", () => {
  it("BDs are always Sales and SMMs always Social media; the founder keeps the saved choice", () => {
    expect(departmentFor("bd", "social")).toBe("sales");
    expect(departmentFor("social", "sales")).toBe("social");
    expect(departmentFor("founder", "social")).toBe("social");
    expect(departmentFor("founder", undefined)).toBe("all");
    expect(parseDepartment("marketing")).toBe("all");
  });

  it("keeps each department's people, and the founder in every view", () => {
    expect(inDepartment("bd", "sales")).toBe(true);
    expect(inDepartment("bd", "social")).toBe(false);
    expect(inDepartment("social", "sales")).toBe(false);
    expect(inDepartment("founder", "social")).toBe(true);
    expect(inDepartment("social", "all")).toBe(true);
  });

  it("hides the other department's pages and settings tabs", () => {
    expect(pathInDepartment("/leads/123", "social")).toBe(false);
    expect(pathInDepartment("/pipeline", "social")).toBe(false);
    expect(pathInDepartment("/settings/outcomes", "social")).toBe(false);
    expect(pathInDepartment("/content", "sales")).toBe(false);
    expect(pathInDepartment("/settings/pillars", "sales")).toBe(false);
    for (const shared of ["/my-day", "/tasks", "/feed", "/team", "/settings/lists", "/settings/targets"]) {
      expect(pathInDepartment(shared, "sales")).toBe(true);
      expect(pathInDepartment(shared, "social")).toBe(true);
    }
    expect(pathInDepartment("/leads", "all")).toBe(true);
    expect(pathInDepartment("/content", "all")).toBe(true);
  });

  it("narrows feed groups: nothing chosen means the whole view", () => {
    expect(feedGroupsFor("social")).toEqual(["tasks", "social"]);
    expect(feedGroupsFor("sales")).not.toContain("social");
    expect(effectiveFeedGroups([], "all")).toEqual([]);
    expect(effectiveFeedGroups([], "social")).toEqual(["tasks", "social"]);
    expect(effectiveFeedGroups(["leads", "social"], "social")).toEqual(["social"]);
    expect(effectiveFeedGroups(["social"], "sales")).toEqual(feedGroupsFor("sales"));
  });

  it("narrows notification groups for the founder only", () => {
    expect(groupsFor("founder", "social")).toEqual(["tasks", "social"]);
    expect(groupsFor("founder", "sales")).toEqual(["meetings", "deals", "leads", "tasks"]);
    expect(groupsFor("founder")).toHaveLength(5);
    expect(groupsFor("bd", "all")).toEqual(["meetings", "deals", "leads", "tasks"]);
  });
});
