import zlib

import numpy as np
import eccodes as ec
from bson import Binary


def read_field(msg):
    """Decode one GRIB message (bytes) into (lats, lons, values): lats north first, lons west first (-180..180),
    values shaped (len(lats), len(lons)). Regular lat-lon grids only (all four sources are)."""
    gid = ec.codes_new_from_message(msg)
    try:
        ni, nj = ec.codes_get(gid, 'Ni'), ec.codes_get(gid, 'Nj')
        lat1, lat2 = ec.codes_get(gid, 'latitudeOfFirstGridPointInDegrees'), ec.codes_get(gid, 'latitudeOfLastGridPointInDegrees')
        lon1, di = ec.codes_get(gid, 'longitudeOfFirstGridPointInDegrees'), ec.codes_get(gid, 'iDirectionIncrementInDegrees')
        if ec.codes_get(gid, 'iScansNegatively'):
            di = -di
        vals = np.array(ec.codes_get_values(gid), dtype=np.float64).reshape(nj, ni)
    finally:
        ec.codes_release(gid)
    lats = np.linspace(lat1, lat2, nj)
    # longitudes from the step, not from the last point: the ECMWF files start at 180 and wrap around to 179.75
    lons = ((lon1 + di * np.arange(ni) + 180.0) % 360.0) - 180.0
    if lats[0] < lats[-1]:                      # scanned south to north: flip so row 0 is the northern edge
        lats, vals = lats[::-1], vals[::-1]
    order = np.argsort(lons)                    # 0..360 grids wrap around the meridian: sort west to east
    return lats, lons[order], vals[:, order]


def cut(lats, lons, vals, box, stride):
    """Crop to the box (None = keep everything) and keep every `stride`-th point."""
    if box:
        lat_min, lat_max, lon_min, lon_max = box
        li = np.where((lats >= lat_min) & (lats <= lat_max))[0]
        lj = np.where((lons >= lon_min) & (lons <= lon_max))[0]
        lats, lons, vals = lats[li], lons[lj], vals[np.ix_(li, lj)]
    return lats[::stride], lons[::stride], vals[::stride, ::stride]


def pack(lats, lons, vals):
    """The part of a weather_grids document that describes the grid: uint16 between min and max (value =
    min + q * (max - min) / 65535), the high bytes first and then the low bytes (compresses better), zlib level 6."""
    v = np.asarray(vals, dtype=np.float64)
    finite = np.isfinite(v)
    vmin = float(v[finite].min()) if finite.any() else 0.0
    vmax = float(v[finite].max()) if finite.any() else 0.0
    rng = (vmax - vmin) or 1.0
    q = np.round((np.where(finite, v, vmin) - vmin) / rng * 65535.0).astype(np.uint16).ravel()
    body = (q >> 8).astype(np.uint8).tobytes() + (q & 255).astype(np.uint8).tobytes()
    ny, nx = v.shape
    return {
        'nx': nx, 'ny': ny,
        'lat0': float(lats[0]), 'lon0': float(lons[0]),
        'dlat': float(abs(lats[1] - lats[0])) if ny > 1 else 0.0,
        'dlon': float(lons[1] - lons[0]) if nx > 1 else 0.0,
        'min': vmin, 'max': vmax,
        'packed': Binary(zlib.compress(body, 6)),
    }


def unpack(doc):
    """Inverse of pack(), used by the tests: the (ny, nx) array of values."""
    raw = zlib.decompress(bytes(doc['packed']))
    n = doc['nx'] * doc['ny']
    hi = np.frombuffer(raw[:n], dtype=np.uint8).astype(np.uint16)
    lo = np.frombuffer(raw[n:], dtype=np.uint8).astype(np.uint16)
    q = ((hi << 8) | lo).reshape(doc['ny'], doc['nx'])
    return doc['min'] + q * ((doc['max'] - doc['min']) / 65535.0)
