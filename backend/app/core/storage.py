import boto3

from botocore.config import Config
from botocore.exceptions import ClientError

from .config import (S3_ACCESS_KEY, S3_BUCKET, S3_INTERNAL_ENDPOINT,
                     S3_PUBLIC_ENDPOINT, S3_REGION, S3_SECRET_KEY)

def _s3_client(endpoint_url: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            )
    )
internal_s3 = _s3_client(S3_INTERNAL_ENDPOINT) # Internal client for server-to-server calls 
_public_s3 = _s3_client(S3_PUBLIC_ENDPOINT) # Public client for generating presigned URLs for browser uploads


def presigned_upload_url(object_key: str, expires_in: int = 900) -> str:
    """A temporary URL that lets the holder PUT exactly one object. No credentials shared."""

    return _public_s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": S3_BUCKET, "Key": object_key},
        ExpiresIn=expires_in,
    )

def object_exists(object_key: str) -> bool:
    """Check if an object exists in the S3 bucket."""

    try:
        internal_s3.head_object(Bucket=S3_BUCKET, Key=object_key)
        return True
    except ClientError as err:
        # Only "no such object" means missing. A permissions or server error is a real
        # failure and must not be reported to the user as "file not found".
        if err.response["Error"]["Code"] in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise

def download_file(object_key: str, destination_path: str) -> None:
    """Download an object from the S3 bucket to a local file."""

    internal_s3.download_file(S3_BUCKET, object_key, destination_path)