import { expect, it } from "vitest";
import { jpHolidayName, isJpDayOff } from "./jp-holidays";

it("knows fixed and Happy-Monday holidays", () => {
  expect(jpHolidayName(2026, 1, 1)).toBe("元日");
  expect(jpHolidayName(2026, 1, 12)).toBe("成人の日");   // 1月第2月曜
  expect(jpHolidayName(2026, 2, 11)).toBe("建国記念の日");
  expect(jpHolidayName(2026, 2, 23)).toBe("天皇誕生日");
  expect(jpHolidayName(2026, 7, 20)).toBe("海の日");     // 7月第3月曜
  expect(jpHolidayName(2026, 8, 11)).toBe("山の日");
  expect(jpHolidayName(2026, 9, 21)).toBe("敬老の日");   // 9月第3月曜
  expect(jpHolidayName(2026, 10, 12)).toBe("スポーツの日");
  expect(jpHolidayName(2026, 11, 3)).toBe("文化の日");
  expect(jpHolidayName(2026, 11, 23)).toBe("勤労感謝の日");
});
it("computes the equinoxes", () => {
  expect(jpHolidayName(2026, 3, 20)).toBe("春分の日");
  expect(jpHolidayName(2026, 9, 23)).toBe("秋分の日");
  expect(jpHolidayName(2027, 3, 21)).toBe("春分の日");
  expect(jpHolidayName(2028, 9, 22)).toBe("秋分の日");
});
it("adds substitute holidays and the day sandwiched between two holidays", () => {
  expect(jpHolidayName(2026, 5, 6)).toBe("振替休日");     // 5/3(日) 憲法記念日の振替は 5/6(水)
  expect(jpHolidayName(2026, 9, 22)).toBe("国民の休日");  // 敬老の日(9/21)と秋分の日(9/23)に挟まれた日
  expect(jpHolidayName(2027, 3, 22)).toBe("振替休日");    // 3/21(日) 春分の日
  expect(jpHolidayName(2026, 9, 24)).toBeNull();
});
it("treats weekends and holidays as days off", () => {
  expect(isJpDayOff("2026-09-19")).toBe(true);   // 土
  expect(isJpDayOff("2026-09-21")).toBe(true);   // 祝
  expect(isJpDayOff("2026-09-24")).toBe(false);  // 木
  expect(isJpDayOff("bad")).toBe(false);
});
