# Happy Ticket artwork

The standalone Happy Tickets page uses the selected textured Neon ticket, with live text and genuine SVG cut-outs. Happy Tickets are not mounted in Vault.

- `public/images/happy-tickets/neon-v1.webp`: 1200 x 540, 53,510 bytes, generated artwork optimized as static WebP.
- `public/images/happy-tickets/last-ticket-v1.webp`: 1200 x 540, 48,020 bytes, retained as an inactive future-use red design. Stock never selects it automatically and it is not preloaded.
- The blue homepage shortcut uses scoped CSS/SVG and shows no stock number or availability bars.
- Five page availability marks use fixed red, orange, yellow, lime and green positions; only available positions light up. Numeric stock remains visible.
- The existing five-second page entrance loader preloads the Neon image. Image failure leaves the SVG surface and live text usable. Artwork and presentation timers never control claim/reset transactions.
- Reset confirmation is centered. Reduced motion suppresses decorative motion. No persistent shimmer or animated artwork is added.

Browser/device performance is reported separately in the release test results. Preloading is not a performance guarantee.
