import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AlbumPage from '../../src/pages/Visualiser/AlbumPage';
import { GRIMOIRE_ALBUMS } from '../../src/pages/Visualiser/tracks/albums';

function renderAlbumPage(albumId?: string) {
  const id = albumId ?? GRIMOIRE_ALBUMS[0].id;
  return render(
    <MemoryRouter initialEntries={[`/visualiser/album/${id}`]}>
      <Routes>
        <Route path="/visualiser/album/:albumId" element={<AlbumPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AlbumPage', () => {
  it('renders album title for valid album', () => {
    renderAlbumPage();
    expect(screen.getByText(GRIMOIRE_ALBUMS[0].title)).toBeInTheDocument();
  });

  it('renders track list with all non-hidden tracks', () => {
    renderAlbumPage();
    const album = GRIMOIRE_ALBUMS[0];
    const visibleTracks = album.tracks.filter(t => !t.hidden);
    for (const track of visibleTracks) {
      const trackNum = screen.getByText(String(track.trackNumber));
      expect(trackNum).toBeInTheDocument();
    }
  });

  it('renders not-found state for unknown album', () => {
    renderAlbumPage('nonexistent-album-id');
    expect(screen.getByText('Album Not Found')).toBeInTheDocument();
  });

  it('renders audio element with crossOrigin', () => {
    renderAlbumPage();
    const audio = document.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio?.crossOrigin).toBe('anonymous');
  });

  it('renders transport controls', () => {
    renderAlbumPage();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous track')).toBeInTheDocument();
    expect(screen.getByLabelText('Next track')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat album')).toBeInTheDocument();
  });

  it('renders aria-live region for track announcements', () => {
    renderAlbumPage();
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
  });
});
