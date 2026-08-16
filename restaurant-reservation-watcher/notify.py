import os

from twilio.rest import Client


def send_sms(body: str) -> None:
    sid = os.environ["TWILIO_ACCOUNT_SID"]
    token = os.environ["TWILIO_AUTH_TOKEN"]
    from_number = os.environ["TWILIO_FROM_NUMBER"]
    to_number = os.environ["TWILIO_TO_NUMBER"]

    client = Client(sid, token)
    client.messages.create(body=body, from_=from_number, to=to_number)
