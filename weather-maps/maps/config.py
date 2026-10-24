import configparser


def load(path='config.ini'):
    cp = configparser.ConfigParser(interpolation=None)
    # utf-8-sig: a config.ini saved with a BOM must not break the first section header
    cp.read(path, encoding='utf-8-sig')
    return cp


def get(cfg, section, key, default=None):
    return cfg.get(section, key, fallback=default)


def box(cfg):
    """Europe box (lat_min, lat_max, lon_min, lon_max) cut out of the large grids."""
    return (float(get(cfg, 'maps', 'lat_min', '35')), float(get(cfg, 'maps', 'lat_max', '70')),
            float(get(cfg, 'maps', 'lon_min', '-25')), float(get(cfg, 'maps', 'lon_max', '45')))
