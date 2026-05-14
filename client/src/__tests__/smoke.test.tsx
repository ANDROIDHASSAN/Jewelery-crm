import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('client smoke', () => {
  it('renders a Button', () => {
    render(<Button>Hello</Button>);
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
  });
});
