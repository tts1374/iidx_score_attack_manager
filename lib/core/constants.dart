const String appName = '大会・エビデンス管理';

const String appDatabaseFileName = 'app_data.sqlite';
const String songMasterFileName = 'song_master.sqlite';

const String songMasterSchemaVersion = '33';

const String githubRepoOwner = 'tts1374';
const String githubRepoName = 'iidx_all_songs_master';
const String githubAssetFileName = 'song_master.sqlite';

const int maxTournamentNameLength = 50;
const int maxOwnerLength = 50;
const int maxHashtagLength = 50;
const int maxChartsPerTournament = 4;

const int qrMaxBytes = 2953;

const int postImageWidth = 1080;
const int postImageHeight = 1920;

const String settingSongMasterAssetUpdatedAt = 'song_master_asset_updated_at';
const String settingSongMasterDownloadedAt = 'song_master_downloaded_at';
const String settingSongMasterSchemaVersion = 'song_master_schema_version';
const String settingSongMasterUpdateSource = 'song_master_update_source';

const String songMasterSourceLocalCache = 'local_cache';
const String songMasterSourceGithubDownload = 'github_download';
const String songMasterSourceGithubMetadata = 'github_metadata';
