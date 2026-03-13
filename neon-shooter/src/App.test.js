import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders racing game title", () => {
  render(<App />);
  const title = screen.getByText(/neon highway racer/i);
  expect(title).toBeInTheDocument();
});
