
import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		/* Motion tokens (src/styles/motion.css). The numeric scale is mapped onto the calm portal tokens so every
		   existing duration-* / ease-* class follows the system; new code uses the names (duration-fast …). */
		transitionDuration: {
			DEFAULT: 'var(--dur-fast)',
			0: '0ms',
			75: 'var(--dur-fast)',
			100: 'var(--dur-fast)',
			150: 'var(--dur-fast)',
			200: 'var(--dur-fast)',
			300: 'var(--dur-med)',
			500: 'var(--dur-slow)',
			700: 'var(--dur-data)',
			1000: 'var(--dur-data)',
			press: 'var(--dur-press)',
			fast: 'var(--dur-fast)',
			med: 'var(--dur-med)',
			slow: 'var(--dur-slow)',
			data: 'var(--dur-data)',
		},
		transitionTimingFunction: {
			DEFAULT: 'var(--ease-out)',
			linear: 'linear',
			in: 'var(--ease-in)',
			out: 'var(--ease-out)',
			'in-out': 'var(--ease-in-out)',
			spring: 'var(--ease-spring)',
		},
		container: {
			center: true,
			padding: '1rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				'sans': ['Heebo', 'system-ui', '-apple-system', 'sans-serif'],
				'inter': ['Heebo', 'system-ui', '-apple-system', 'sans-serif'],
				'display': ['Karantina', 'Heebo', 'sans-serif'],
				'num': ['Anton', 'Heebo', 'sans-serif'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				gold: 'hsl(var(--gold))',
				success: 'hsl(var(--success))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			spacing: {
				'safe-area-inset-bottom': 'env(safe-area-inset-bottom)',
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down var(--dur-med) var(--ease-out)',
				'accordion-up': 'accordion-up var(--dur-fast) var(--ease-in)',
				'fade-in': 'ec-rise var(--dur-med) var(--ease-out) backwards',
				'slide-up': 'ec-rise var(--dur-med) var(--ease-out) backwards',
				pulse: 'ec-pulse var(--dur-loop) var(--ease-in-out) infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
