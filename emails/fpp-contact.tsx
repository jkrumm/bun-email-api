import { Heading, Button, Html } from "@react-email/components";
import * as React from "react";

export default function FppContact() {
  return (
    <Html style={{ fontFamily: "sans-serif" }}>
      <Heading as="h1">Hello, Universe!</Heading>
      <Button
        href="https://spacejelly.dev"
        style={{
          fontFamily: "sans-serif",
          background: "blueviolet",
          color: "white",
          padding: "12px 20px",
        }}
      >
        Visit Space Jelly
      </Button>
    </Html>
  );
}
