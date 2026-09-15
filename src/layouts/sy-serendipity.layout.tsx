import { Container, Heading, Html, Section } from "react-email";
import type { ReactNode } from "react";

export default function SySerendipityLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Html
      style={{
        fontFamily: "sans-serif",
        padding: "30px 20px",
      }}
      lang="en"
    >
      <Container>
        <a
          href="https://sy-serendipity.org/?source=email"
          target="_blank"
          style={{ textDecoration: "none" }}
        >
          <Section
            style={{
              padding: "20px",
            }}
          >
            <Heading
              as="h1"
              style={{
                margin: "0",
                textAlign: "center",
                fontWeight: "bold",
                color: "#3e5769 !important",
              }}
            >
              SY Serendipity I
            </Heading>
          </Section>
        </a>
        <Section
          style={{
            borderTop: "0",
            padding: "20px",
          }}
        >
          {children}
        </Section>
      </Container>
    </Html>
  );
}
